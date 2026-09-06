/*
 * READ-ONLY verification of the ⟳ Repair from Cache pass.
 *
 * DELIBERATELY DOES NOT RECOMPUTE FANTASY SCORES. Re-implementing
 * calcFPForPlatform in a probe is what produced 2270 phantom findings in the
 * first version of this work, and a probe that re-implements production's
 * matching without production's filters has produced three more false positives
 * since. So this checks OUTCOMES, using production as its own oracle:
 *
 *   A. FIXPOINT — click ⟳ Repair a SECOND time. The toast must say
 *      "0 rows corrected". The repair is idempotent by construction (it only
 *      writes when |stored - recomputed| > 0.005), so a non-zero second pass
 *      means something is rewriting rows back, or the pass is unstable.
 *      *** That check is the toast, not this snippet. Do it first. ***
 *
 *   B. ROW COUNT — must be unchanged. This pass rewrites results and must never
 *      add or drop a row.
 *
 *   C. LEDGER vs ARCHIVE — every placed leg carrying a frozen `actual` is
 *      compared to the archive row it was graded from. This is the check that
 *      motivated the repair: legs whose frozen value disagreed with a now-
 *      corrected archive row.
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only.
 */
(async () => {
  'use strict';
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
  console.log('%c[repair-verify] READ-ONLY', 'font-weight:bold;font-size:13px');
  console.log('  archive rows:', archive.length, '— compare to the toast\'s "rows X → Y"; X must equal Y.');
  if (!archive.length) { console.warn('  empty archive — stop.'); return; }

  // Name/event normalizers mirroring PropArchiveService (normalizeEvent is
  // literally this; the name side only needs to be CONSISTENT across the two
  // sides being joined, which it is).
  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nf = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  const idx = new Map();
  for (const r of archive) {
    if (!r) continue;
    const k = `${nf(r.fighter)}|${ne(r.event)}|${String(r.propType ?? '').toLowerCase()}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(r);
  }

  // leg.source -> archive propType. FP splits by book because PrizePicks scores
  // on a different formula and is archived separately as Fantasy_PP.
  const propFor = (leg) => {
    const s = String(leg.source || '').toLowerCase();
    const pp = String(leg.book || '').toLowerCase().includes('prizepick');
    if (s === 'fp') return pp ? ['fantasy_pp'] : ['fantasy'];
    if (s === 'ss') return ['ss'];
    if (s === 'td') return ['td'];
    if (s === 'ctrl') return ['ctrl', 'control'];   // archived under BOTH
    if (s === 'ft') return ['fighttime'];
    return null;                                     // unmapped -> reported, not guessed
  };

  const placed = all['best_picks_placed_v1'];
  const rows = [], verdicts = {};
  if (placed && typeof placed === 'object') {
    // Shape is { eventKey: { legKey: record } } — NOT a flat array. An earlier
    // probe walked the wrong nesting level and reported a meaningless "0 disagree".
    for (const [evKey, legs] of Object.entries(placed)) {
      if (!legs || typeof legs !== 'object') continue;
      for (const leg of Object.values(legs)) {
        if (!leg || typeof leg !== 'object') continue;
        if (leg.actual == null || !Number.isFinite(Number(leg.actual))) continue;
        const props = propFor(leg);
        let hit = null;
        if (props) {
          for (const p of props) {
            const found = idx.get(`${nf(leg.name)}|${ne(evKey)}|${p}`);
            if (found && found.length) { hit = found[0]; break; }
          }
        }
        const v = !props ? 'UNMAPPED SOURCE'
          : !hit ? '? no archive row'
          : Math.abs(Number(hit.result) - Number(leg.actual)) <= 0.005 ? 'ARCHIVE (agrees)'
          : 'FROZEN (disagrees)';
        verdicts[v] = (verdicts[v] || 0) + 1;
        if (v !== 'ARCHIVE (agrees)') {
          rows.push({ fighter: leg.name, event: evKey, stat: leg.statLabel, book: leg.bookLabel,
            'leg actual': Number(leg.actual), 'archive result': hit ? Number(hit.result) : null,
            outcome: leg.outcome, verdict: v });
        }
      }
    }
  }

  console.log('  placed legs with a frozen actual:', Object.values(verdicts).reduce((a, b) => a + b, 0));
  console.log('  verdicts:', verdicts);
  if (rows.length) { console.log('  rows NOT agreeing with the archive:'); console.table(rows); }
  else console.log('  %cevery frozen leg agrees with the archive.', 'color:#3fb950');

  console.log('%c  WANT: no "FROZEN (disagrees)". "? no archive row" is a DIFFERENT problem',
    'color:#d29922');
  console.log('  (the row was pulled or never written) and is not something this repair can fix.');
  window.__repairVerify = { verdicts, rows, archiveRows: archive.length };
})();
