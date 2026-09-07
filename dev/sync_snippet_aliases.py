"""Re-inject the CURRENT NAME_ALIASES into every snippet that embeds a copy.

Snippets can't import from src/, so the ones that need alias-aware name matching
carry a generated copy of NAME_ALIASES. Generating it beats transcribing it — but
it FREEZES it, and a snippet holding a stale alias table silently disagrees with
production.

That is not hypothetical. On 2026-09-07 the 'Damon Jackson' -> 'Donte Johnson'
alias was removed from config because it merged two real fighters, and the
attribution sweep kept resolving Damon Jackson to Donte Johnson for the rest of
the session — reporting three false suspects whose "value belongs to" pointed at
the other man's opponents. The archive was correct the whole time.

Run this after ANY change to NAME_ALIASES:

    python dev/sync_snippet_aliases.py
"""
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / 'src' / 'config' / 'index.ts'
SNIPPETS = ROOT / 'snippets'

# The declaration is not written identically in every snippet — one generator
# emitted a newline after `=` — so allow whitespace before the brace. Rewriting
# through this also normalises them so they agree from here on.
MARKER = re.compile(r'(const ALIASES = )\s*\{.*?\n  \};', re.DOTALL)


def current_aliases() -> dict:
    src = io.open(CONFIG, encoding='utf-8').read()
    blk = src[src.index('export const NAME_ALIASES'):]
    blk = blk[:blk.index('\n};')]
    # Only real entries: a commented-out line is not an alias. Strip // comments
    # first so a removal documented in a comment cannot be read back as live.
    blk = re.sub(r'//[^\n]*', '', blk)
    return dict(re.findall(r"'([^']+)'\s*:\s*'([^']+)'", blk))


def render(aliases: dict) -> str:
    import json
    body = json.dumps(aliases, ensure_ascii=False, indent=2)
    return '\n'.join(('  ' + ln) if i else ln for i, ln in enumerate(body.split('\n')))


def main() -> int:
    aliases = current_aliases()
    block = render(aliases)
    changed, scanned = [], 0
    for path in sorted(SNIPPETS.glob('*.js')):
        text = io.open(path, encoding='utf-8', newline='').read()
        if 'const ALIASES = ' not in text:
            continue
        scanned += 1
        new_text, n = MARKER.subn(lambda m: m.group(1) + block + ';', text, count=1)
        if n != 1:
            print(f'  !! {path.name}: found the marker but could not replace it — check by hand')
            continue
        if new_text != text:
            io.open(path, 'w', encoding='utf-8', newline='\n').write(new_text)
            changed.append(path.name)
    print(f'{len(aliases)} aliases · {scanned} snippet(s) embed a copy · {len(changed)} updated')
    for name in changed:
        print(f'  updated {name}')
    if not changed and scanned:
        print('  all already current')
    return 0


if __name__ == '__main__':
    sys.exit(main())
