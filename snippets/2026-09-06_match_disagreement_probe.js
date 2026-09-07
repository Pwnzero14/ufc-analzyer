/*
 * READ-ONLY. Resolves a contradiction between two of my own tools.
 *
 *   Repair from Cache (2nd run):  "0 rows corrected"
 *   Attribution sweep:            "23 rows disagree with their OWN cached fight"
 *
 * Both now match a row to a fight by event-text-or-date, but they are separate
 * implementations, so at least one is wrong. Do not fix either until this says
 * which. Several sweep "correct" values are implausible on their face — SS 252
 * exceeds the UFC single-fight record, and Amanda Lemos Control 34 vs 0.57 looks
 * like seconds-vs-minutes — which points at the SWEEP matching the wrong fight.
 *
 * For each disagreement this prints the archive row and EVERY fight in that
 * fighter's cached history, so the match can be checked by eye rather than
 * trusted. The dates are the thing to read: if the row's date does not line up
 * with the fight the sweep chose, the sweep is picking wrong.
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only.
 */
(async () => {
  'use strict';
  const SHOW = [
    ['Tommy McMillen',       'SS'],
    ['Jean-Paul Lebosnoyani','SS'],
    ['Charles Johnson',      'SS'],
    ['Amanda Lemos',         'Control'],
    ['Axel Sola',            'FightTime'],
  ];
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nf = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  const caches = new Map();
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('ufcstats_v51_') && v && v.name && Array.isArray(v.fightHistory)) caches.set(nf(v.name), v);
  }

  console.log('%c[match-disagreement] READ-ONLY', 'font-weight:bold;font-size:13px');
  for (const [name, pt] of SHOW) {
    console.log(`\n%c${name} — ${pt}`, 'font-weight:bold;font-size:12px');
    const rec = caches.get(nf(name));
    if (!rec) { console.warn('  NO CACHE — the sweep could not have matched anything.'); continue; }
    console.log(`  cache: ${rec.name} · ${rec.fightHistory.length} fights · fetched ${rec.fetchedAt ? new Date(rec.fetchedAt).toISOString().slice(0,16) : '?'}`);

    const rows = archive.filter((r) => r && nf(r.fighter) === nf(name)
      && String(r.propType).toLowerCase() === pt.toLowerCase());
    console.log('  ARCHIVE ROWS:');
    console.table(rows.map((r) => ({
      event: r.event, date: r.date,
      'date parses': Number.isFinite(Date.parse(String(r.date ?? ''))) ? 'yes' : 'NO',
      result: r.result, line: r.line ?? null, platform: r.platform || '', opponent: r.opponent,
    })));
    console.log('  CACHED FIGHTS:');
    console.table(rec.fightHistory.map((f, i) => ({
      i, event: f.event, date: f.date,
      'date parses': Number.isFinite(Date.parse(String(f.date ?? ''))) ? 'yes' : 'NO',
      opponent: f.opponent, sigStr: f.sigStr, totStr: f.totStr,
      ctrlSecs: f.ctrlSecs, timeSecs: f.timeSecs, result: f.result,
    })));
  }
  console.log('\n%cRead the DATES. If an archive row carries a date that is not its event date', 'color:#d29922');
  console.log('(a scrape date, say), then matching by date is unsound and the sweep is wrong.');
  console.log('If the dates line up and the values still differ, the REPAIR is skipping rows.');
  window.__matchDbg = { archive, caches };
})();
