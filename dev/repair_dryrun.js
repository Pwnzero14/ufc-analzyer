/*
 * OFFLINE DRY RUN of healArchiveFromCache's matching, against a real storage
 * backup. Answers one question and writes nothing:
 *
 *   Does the date-matching repair actually correct the rows the sweep found,
 *   or is there a bug in it?
 *
 * If it corrects them here, the code is fine and the extension was running a
 * stale build. If it does not, the bug is real and this shows where.
 *
 * normalizeName / foldLetters / NAME_ALIASES are LIFTED OUT OF dist AT RUNTIME
 * rather than reimplemented — a hand-copied normalizer is how this project has
 * repeatedly produced findings that were really probe defects.
 *
 *   node dev/repair_dryrun.js "<path to ufc-storage-backup-*.json>"
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const distAnalyzer = fs.readFileSync(path.join(ROOT, 'dist/analyzer.js'), 'utf8');
const distConfig = fs.readFileSync(path.join(ROOT, 'dist/config/index.js'), 'utf8');

/** Extract `<decl> ... {` through its matching close brace, by brace counting. */
function lift(src, startRe, label) {
  const m = src.match(startRe);
  if (!m) throw new Error(`could not find ${label} in dist`);
  let i = src.indexOf('{', m.index);
  if (i < 0) throw new Error(`no body for ${label}`);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error(`unbalanced braces for ${label}`);
}

const foldSrc = lift(distConfig, /function foldLetters\s*\(/, 'foldLetters');
const normSrc = lift(distAnalyzer, /function normalizeName\s*\(/, 'normalizeName');
// LETTER_FOLD and NAME_ALIASES are object literals; lift them the same way.
const letterFoldSrc = lift(distConfig, /(?:export )?const LETTER_FOLD\s*=/, 'LETTER_FOLD');
// foldLetters closes over a precompiled regex declared separately.
const letterFoldReSrc = (distConfig.match(/(?:export )?const LETTER_FOLD_RE\s*=[^;]+;/) || [''])[0];
if (!letterFoldReSrc) throw new Error('could not find LETTER_FOLD_RE in dist');
const aliasesSrc = lift(distConfig, /(?:export )?const NAME_ALIASES\s*=/, 'NAME_ALIASES');

const sandbox = {};
// eslint-disable-next-line no-new-func
new Function('exports', `
  ${letterFoldSrc.replace(/^export\s+/, '')};
  ${letterFoldReSrc.replace(/^export\s+/, '')}
  ${aliasesSrc.replace(/^export\s+/, '')};
  ${foldSrc}
  ${normSrc}
  exports.normalizeName = normalizeName;
  exports.NAME_ALIASES = NAME_ALIASES;
`)(sandbox);
const { normalizeName } = sandbox;
console.log(`lifted normalizeName from dist (${Object.keys(sandbox.NAME_ALIASES).length} aliases)`);
console.log(`  sanity: "Tommy McMillen" -> ${normalizeName('Tommy McMillen')}`);
console.log(`  sanity: "Tommy Mcmillen" -> ${normalizeName('Tommy Mcmillen')}`);

const file = process.argv[2];
if (!file) { console.error('usage: node dev/repair_dryrun.js <backup.json>'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
// Backups nest everything under `.storage`; the STEP1 snippet uses `.data`.
const all = raw.storage || raw.data || raw;
const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
console.log(`\nbackup: ${path.basename(file)}\n  archive rows: ${archive.length}`);
if (!archive.length) { console.error('  no archive in this backup'); process.exit(1); }

// ── the repair's matching, mirrored ────────────────────────────────────────
const nf = (v) => (normalizeName(String(v ?? '')) || '').toLowerCase();
const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const ctrlMinsOf = (s) => Math.round((Number(s) / 60) * 100) / 100;
const normalizePropType = (p) => {
  const v = String(p || '').trim();
  if (!v) return 'Fantasy';
  if (/^ss$/i.test(v)) return 'SS';
  if (/^td$/i.test(v)) return 'TD';
  if (/^fantasy_pp$/i.test(v) || /^fp_pp$/i.test(v)) return 'Fantasy_PP';
  if (/^fantasy$/i.test(v) || /^fp$/i.test(v)) return 'Fantasy';
  if (/^control$/i.test(v)) return 'Control';
  if (/^ft$/i.test(v) || /^fight\s*time$/i.test(v) || /^fighttime$/i.test(v)) return 'FightTime';
  return v;
};

const idx = new Map();
for (const r of archive) {
  if (!r) continue;
  const k = `${nf(r.fighter)}|${String(normalizePropType(r.propType)).toLowerCase()}`;
  if (!idx.has(k)) idx.set(k, []);
  idx.get(k).push(r);
}
const DATE_TOL_MS = 2 * 24 * 60 * 60 * 1000;

let fighters = 0, wouldChange = 0;
const byFighter = new Map();
for (const key of Object.keys(all)) {
  if (!/^ufcstats_v51_/.test(key)) continue;
  const rec = all[key];
  if (!rec || !rec.name || !Array.isArray(rec.fightHistory) || !rec.fightHistory.length) continue;
  fighters++;
  const who = nf(rec.name);
  for (const f of rec.fightHistory) {
    if (!f || !f.event) continue;
    if (f.sigStr == null && f.totStr == null && f.kd == null && f.td == null && f.ctrlSecs == null) continue;
    const ev = ne(f.event);
    const fightTs = Date.parse(String(f.date ?? ''));
    // Formula-free targets only; this dry run is about MATCHING, not scoring.
    const targets = [
      [['ss'], f.sigStr ?? null],
      [['td'], f.td ?? null],
      [['ctrl', 'control'], f.ctrlSecs != null ? ctrlMinsOf(f.ctrlSecs) : null],
      [['fighttime'], f.timeSecs != null ? parseFloat((Number(f.timeSecs) / 60).toFixed(2)) : null],
    ];
    for (const [pts, value] of targets) {
      if (value == null || !Number.isFinite(Number(value))) continue;
      for (const pt of pts) {
        for (const row of idx.get(`${who}|${pt}`) ?? []) {
          const rowTs = Date.parse(String(row.date ?? ''));
          const sameEvent = ne(row.event) === ev;
          const sameDate = Number.isFinite(fightTs) && Number.isFinite(rowTs)
            && Math.abs(rowTs - fightTs) <= DATE_TOL_MS;
          if (!sameEvent && !sameDate) continue;
          if (!Number.isFinite(Number(row.result))) continue;
          if (Math.abs(Number(row.result) - Number(value)) <= 0.005) continue;
          wouldChange++;
          const list = byFighter.get(rec.name) || [];
          list.push({ event: row.event, propType: row.propType, from: row.result, to: Number(value),
            platform: row.platform || '', via: sameEvent ? 'event' : 'date' });
          byFighter.set(rec.name, list);
        }
      }
    }
  }
}

console.log(`  cached fighters: ${fighters}`);
console.log(`  rows this WOULD correct (formula-free propTypes only): ${wouldChange}`);
const WATCH = ['Tommy Mcmillen', 'Tommy McMillen', 'Jean Paul Lebosnoyani', 'Charles Johnson'];
for (const w of WATCH) {
  const hits = byFighter.get(w);
  if (!hits) continue;
  console.log(`\n  ${w}:`);
  for (const h of hits) console.log(`    ${h.propType.padEnd(10)} ${String(h.from).padEnd(7)} -> ${String(h.to).padEnd(7)} via ${h.via.padEnd(5)} ${h.platform.padEnd(22)} ${h.event}`);
}
console.log('\nIf McMillen SS 113 -> 252 appears above, the repair CODE is correct and the');
console.log('extension was running a stale build. If it does not, the bug is real.');
