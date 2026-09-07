/*
 * READ-ONLY. Breakdown of rows carrying a result for a card the fighter has no
 * fight on record for.
 *
 * WHY THIS EXISTS BEFORE ANY CLEARING PASS: the attribution sweep's suspect list
 * is a DETECTION HEURISTIC, not the population. It only flags a row whose value
 * matches exactly one other bout of that fighter — deliberately narrow, so it
 * reports signal rather than arithmetic. Steve Garcia has ~10 rows on UFC Freedom
 * 250 and only 5 surfaced. Clearing "the 20 flagged rows" would fix half a
 * problem and leave the rest looking settled.
 *
 * The real population is the sweep's `event missing from a cache NEWER than the
 * event` bucket — 249 rows. But that bucket mixes two very different things:
 *
 *   GENUINE NO-SHOW  the fighter has cached fights BOTH BEFORE AND AFTER this
 *                    date, so the cache is not merely short — they did not fight
 *                    this card. Lines were posted, the bout fell out, and a stale
 *                    result was later written in.
 *   CACHE GAP        the date is after their last cached fight (or before their
 *                    first). The cache may simply not cover it, and clearing
 *                    would destroy a real result.
 *
 * Only the first is safe to clear. Blanking all 249 would be the biggest
 * destructive mistake available in this codebase, so this separates them and
 * clears nothing.
 *
 * Also reports whether OTHER fighters have cached fights on that date, which
 * confirms the event is real and correctly dated rather than a bad date on the
 * row.
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only.
 */
(async () => {
  'use strict';
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
  console.log('%c[orphan-result-breakdown] READ-ONLY', 'font-weight:bold;font-size:13px');
  if (!archive.length) { console.warn('  empty archive — stop.'); return; }

  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nf = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const TOL = 2 * 24 * 60 * 60 * 1000;
  const DAY = 86400000;

  const caches = new Map();
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('ufcstats_v51_') && v && v.name && Array.isArray(v.fightHistory)) caches.set(nf(v.name), v);
  }

  // Every date on which ANY cached fighter has a fight — used to confirm a card
  // really happened on the date a row claims.
  const fightDates = [];
  for (const rec of caches.values()) {
    for (const f of rec.fightHistory) {
      const ts = Date.parse(String(f?.date ?? ''));
      if (Number.isFinite(ts)) fightDates.push(ts);
    }
  }
  const someoneFoughtOn = (ts) => fightDates.some((t) => Math.abs(t - ts) <= TOL);

  const groups = new Map();
  let scanned = 0;
  for (const r of archive) {
    if (!r) continue;
    if (!Number.isFinite(Number(r.result))) continue;
    const rec = caches.get(nf(r.fighter));
    if (!rec) continue;
    const rowTs = Date.parse(String(r.date ?? ''));
    const fetched = Number(rec.fetchedAt);
    if (!Number.isFinite(rowTs) || !Number.isFinite(fetched)) continue;
    if (fetched <= rowTs) continue;                       // cache predates the event — benign
    const hist = rec.fightHistory
      .map((f) => ({ ev: f?.event, ts: Date.parse(String(f?.date ?? '')) }))
      .filter((x) => Number.isFinite(x.ts))
      .sort((a, b) => a.ts - b.ts);
    if (hist.some((f) => Math.abs(f.ts - rowTs) <= TOL)) continue;   // they DID fight it
    scanned++;

    const key = `${nf(r.fighter)}|${ne(r.event)}`;
    let g = groups.get(key);
    if (!g) {
      const before = hist.filter((f) => f.ts < rowTs).pop() || null;
      const after = hist.find((f) => f.ts > rowTs) || null;
      g = {
        fighter: r.fighter, event: r.event, date: String(r.date ?? '').slice(0, 10),
        rows: 0, withLine: 0, propTypes: new Set(),
        'cached fights': hist.length,
        'last fight BEFORE': before ? new Date(before.ts).toISOString().slice(0, 10) : null,
        'next fight AFTER': after ? new Date(after.ts).toISOString().slice(0, 10) : null,
        'others fought that date': someoneFoughtOn(rowTs) ? 'yes' : 'NO — suspect the row date',
        verdict: before && after ? 'NO-SHOW — safe to clear'
          : !after ? 'CACHE GAP? date is after their last cached fight'
          : 'CACHE GAP? date is before their first cached fight',
      };
      groups.set(key, g);
    }
    g.rows++;
    if (r.line != null && Number.isFinite(Number(r.line))) g.withLine++;
    g.propTypes.add(String(r.propType));
  }

  const out = [...groups.values()]
    .map((g) => ({ ...g, propTypes: [...g.propTypes].join(','), }))
    .sort((a, b) => (a.verdict === b.verdict ? b.rows - a.rows : a.verdict < b.verdict ? -1 : 1));

  const tally = {};
  for (const g of out) tally[g.verdict] = (tally[g.verdict] || 0) + g.rows;
  console.log(`  rows with a result on a card the fighter has no fight for: ${scanned}`);
  console.log(`  distinct fighter+event groups: ${out.length}`);
  console.log('  rows by verdict:', tally);
  console.table(out);
  console.log('\n%c  ONLY "NO-SHOW — safe to clear" is safe.', 'color:#d29922;font-weight:bold');
  console.log('  It means the fighter has cached fights on BOTH sides of this date, so the');
  console.log('  cache is not merely short — they did not fight this card.');
  console.log('  A CACHE GAP row may hold a real result the cache simply does not cover.');
  window.__orphans = { groups: out, tally, scanned };
})();
