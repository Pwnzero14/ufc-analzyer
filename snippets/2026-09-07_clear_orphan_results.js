/*
 * WRITES to prop_archive_v1. Clears results on rows for cards the fighter has
 * no fight on record for, after three rounds of refetching failed to produce one.
 *
 * Run the BACKUP first: snippets/2026-09-06_STEP1_backup.js
 *
 * SCOPE — 11 rows in 6 groups, named explicitly below. This is deliberately NOT
 * derived from a filter at runtime. The orphan population started at 249 rows
 * and 238 of them turned out to be STALE CACHE, not bad data: refetching the
 * fighters made them validate normally. A filter-driven clearing pass written
 * at any earlier point in that sequence would have destroyed ~180 legitimate
 * results, including a whole card I had wrongly concluded never happened.
 *
 * So the targets are a fixed list, and each one is RE-VERIFIED at run time
 * against the live cache. If a fighter has since gained a fight on that date,
 * their rows are SKIPPED, not cleared.
 *
 * WHY CLEAR AND NOT DELETE: a cleared row keeps its line and its identity, and
 * background.ts's settle already purges a lined row with no result whose fighter
 * is absent from that event's UFCStats roster. Clearing hands them to machinery
 * that already exists; deleting would drop line history no other store holds.
 *
 * CONFIDENCE IS NOT UNIFORM:
 *   Conor McGregor   fights on BOTH sides of the date — the strict test        HIGH
 *   Jean Silva       PRIDE Bushido 8, 2005 — rows describe a DIFFERENT
 *                    fighter of the same name, residue from the pin fix        HIGH
 *   Islam Dulatov    refetched twice, gained 0, no fight since 2025-07-19      MED-HIGH
 *   Namo Fazil       UFC debut 2026-08-18, so a 2026-05-16 row predates it     MED-HIGH
 *
 * Paste into the ANALYZER page console.
 */
(async () => {
  'use strict';
  // fighter, YYYY-MM-DD of the row, why
  const TARGETS = [
    ['Conor McGregor', '2026-06-14', 'booked for Freedom 250, no fight on record; fights both sides'],
    ['Jean Silva',     '2005-07-17', 'PRIDE Bushido 8 belongs to the OTHER Jean Silva'],
    ['Islam Dulatov',  '2026-07-25', 'refetched x2, gained 0, no fight since 2025-07-19'],
    ['Namo Fazil',     '2026-05-16', 'UFC debut is 2026-08-18; this date predates his career'],
  ];

  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const mark = all['last_ledger_backup_v1'];
  const ageH = mark && mark.at ? (Date.now() - mark.at) / 3600000 : Infinity;
  if (!mark || !(ageH < 2)) {
    console.error('%cNO RECENT BACKUP. Run snippets/2026-09-06_STEP1_backup.js first.', 'color:#f85149;font-weight:bold');
    console.error(mark ? `  newest backup is ${ageH.toFixed(1)}h old; need < 2h` : '  no backup marker at all');
    return;
  }
  console.log('%c[clear-orphans]', 'font-weight:bold;font-size:13px', `backup ${ageH.toFixed(2)}h old — ok`);

  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
  if (!archive.length) { console.error('  empty archive — stop.'); return; }
  const nf = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const TOL = 2 * 24 * 60 * 60 * 1000;
  const caches = new Map();
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('ufcstats_v51_') && v && v.name && Array.isArray(v.fightHistory)) caches.set(nf(v.name), v);
  }

  const report = [];
  let cleared = 0, skipped = 0;
  for (const r of archive) {
    if (!r || !Number.isFinite(Number(r.result))) continue;
    const day = String(r.date ?? '').slice(0, 10);
    const t = TARGETS.find(([name, d]) => d === day && nf(name) === nf(r.fighter));
    if (!t) continue;

    // RE-VERIFY against the live cache. A refetch since the breakdown may have
    // produced the fight, in which case this row is fine and must not be touched.
    const rec = caches.get(nf(r.fighter));
    const rowTs = Date.parse(String(r.date ?? ''));
    const has = rec && rec.fightHistory.some((f) => {
      const ts = Date.parse(String(f?.date ?? ''));
      return Number.isFinite(ts) && Number.isFinite(rowTs) && Math.abs(ts - rowTs) <= TOL;
    });
    if (has) {
      skipped++;
      report.push({ fighter: r.fighter, event: r.event, date: day, propType: r.propType,
        result: r.result, action: 'SKIPPED — fighter now HAS a fight on this date' });
      continue;
    }
    report.push({ fighter: r.fighter, event: r.event, date: day, propType: r.propType,
      line: r.line ?? null, 'result cleared': r.result, platform: r.platform || '', why: t[2] });
    delete r.result;
    cleared++;
  }

  console.log(`  cleared: ${cleared} · skipped (now valid): ${skipped}`);
  if (report.length) console.table(report);
  if (!cleared) { console.log('%c  nothing to write.', 'color:#3fb950'); return; }

  const err = await new Promise((res) => chrome.storage.local.set({ prop_archive_v1: archive }, () => res(chrome.runtime.lastError || null)));
  if (err) { console.error('%c  WRITE REJECTED:', 'color:#f85149;font-weight:bold', err.message || err); return; }
  // Read back and count — a set() callback fires even when the write was rejected.
  const check = await new Promise((r) => chrome.storage.local.get(['prop_archive_v1'], r));
  const back = Array.isArray(check.prop_archive_v1) ? check.prop_archive_v1 : [];
  let stillSet = 0;
  for (const r of back) {
    if (!r || !Number.isFinite(Number(r.result))) continue;
    const day = String(r.date ?? '').slice(0, 10);
    if (TARGETS.some(([name, d]) => d === day && nf(name) === nf(r.fighter))) stillSet++;
  }
  if (stillSet) {
    console.error('%c  WRITE DID NOT PERSIST.', 'color:#f85149;font-weight:bold',
      `${stillSet} target row(s) still carry a result.`);
    return;
  }
  console.log(`%c  VERIFIED: ${cleared} result(s) cleared, read back clean. Rows ${back.length} (unchanged).`,
    'color:#3fb950;font-weight:bold');
  console.log('  Re-run the orphan breakdown; it should report 0 rows.');
})();
