/*
 * READ-ONLY. Tests ONE hypothesis about the 3 surviving SS legs:
 *
 *   "The leg was frozen from the WRONG FIGHT — the most recent bout in the
 *    cached fightHistory at grade time, because the fight being graded was not
 *    in the cache yet."
 *
 * Kaue Fernandes fits exactly: frozen 23, and his PREVIOUS fight (vs Marc
 * Diakiese) is sig=23. One exact match is a lead, not a finding — the Donchenko
 * control-time theory also matched exactly (96.8-81.83 = 499x0.03) and was
 * wrong. So this prints EVERY fight in each fighter's history with its sigStr,
 * and marks which one the frozen value equals, if any.
 *
 * Read the output as: does the frozen value land on the immediately-previous
 * fight for ALL THREE, or does it land somewhere arbitrary (or nowhere)?
 * Arbitrary or nowhere kills the hypothesis.
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only.
 */
(async () => {
  'use strict';
  const WANT = [
    ['Kaue Fernandes',  'ufc 330: makhachev vs. machado garry',     23],
    ['Lerryan Douglas', 'ufc fight night: hernandez vs. rodrigues',  7],
    ['Marquel Mederos', 'ufc fight night: hernandez vs. rodrigues', 110],
  ];
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nf = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const caches = new Map();
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('ufcstats_v51_') && v && v.name) caches.set(nf(v.name), v);
  }

  console.log('%c[wrong-fight-freeze] READ-ONLY', 'font-weight:bold;font-size:13px');
  for (const [name, ev, frozen] of WANT) {
    const rec = caches.get(nf(name));
    console.log(`\n%c${name} — frozen at ${frozen}`, 'font-weight:bold');
    if (!rec) { console.warn('  no cache'); continue; }
    const hist = (rec.fightHistory || []);
    const gradedIdx = hist.findIndex((f) => f && ne(f.event) === ev);
    console.table(hist.map((f, i) => ({
      i, event: f.event, date: f.date, opponent: f.opponent,
      sigStr: f.sigStr, totStr: f.totStr, result: f.result,
      '<- GRADED FIGHT': i === gradedIdx ? 'yes' : '',
      '<- EQUALS FROZEN': Number(f.sigStr) === Number(frozen) ? 'SIG MATCH'
        : Number(f.totStr) === Number(frozen) ? 'TOT MATCH' : '',
    })));
    const sigHit = hist.findIndex((f) => Number(f.sigStr) === Number(frozen));
    console.log(`  graded fight is index ${gradedIdx}; frozen value matches sigStr at index ${sigHit}`,
      sigHit >= 0 && gradedIdx >= 0
        ? `(offset ${sigHit - gradedIdx}${sigHit - gradedIdx === 1 ? ' — THE PREVIOUS FIGHT' : ''})`
        : '(no sigStr match anywhere in history)');
  }
  console.log('\n%cHypothesis SURVIVES only if all three land at offset +1. Anything else kills it.',
    'color:#d29922');
})();
