/*
 * READ-ONLY. Classifies the 22 surviving wrong-fight-attribution suspects.
 *
 * The repair CANNOT fix these. It rewrites a row's result from the fight that
 * row belongs to — but if the fighter never fought that card, there is no
 * correct value to write. The remedy would be to CLEAR the result, which is
 * destructive, so it needs a firm diagnosis and a backup first.
 *
 * The decisive question is whether the target event is in the FUTURE. Conor
 * McGregor's suspect value comes from UFC on FUEL TV in April 2013 and he has
 * not fought since 2021, so `UFC Freedom 250` is very likely an ANNOUNCED card.
 * A future card's row should carry a line and NO result; if it carries a result,
 * settle wrote a past fight's value into it via the unguarded lone-candidate
 * branch (fixed 2daecc0, but the damage predates the fix).
 *
 * Prints, per suspect row: the row's date, whether that date is in the future,
 * whether the row carries a LINE, and whether the fighter has ANY cached fight
 * near that date. A future-dated row with a line and no matching cached fight
 * is a live line that has been falsely settled.
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only.
 */
(async () => {
  'use strict';
  const EVENTS = [
    'ufc freedom 250',
    'ufc fight night: ilia topuria vs justin gaethje',
    'ufc fight night: allen vs. curtis 2',
    'ufc fight night: sandhagen vs. font',
    'ufc fight night: ramazonbek temirov vs steve erceg',
    'ufc fight night: abdul hussein vs cody gibson',
    'ufc 330: makhachev vs. machado garry',
    'ufc fight night: ian machado garry vs islam makhachev',
  ];
  const WATCH = ['Steve Garcia', 'Josh Hokit', 'Conor McGregor', 'Diego Lopes',
    'Rafael Tobias', 'Islam Dulatov', 'Donte Johnson'];

  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nf = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const caches = new Map();
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('ufcstats_v51_') && v && v.name && Array.isArray(v.fightHistory)) caches.set(nf(v.name), v);
  }

  const NOW = Date.now();
  console.log('%c[suspect-classify] READ-ONLY', 'font-weight:bold;font-size:13px');
  console.log('  today:', new Date(NOW).toISOString().slice(0, 10));

  // 1. What are these events, and when?
  const evRows = new Map();
  for (const r of archive) {
    if (!r) continue;
    const k = ne(r.event);
    if (!EVENTS.includes(k)) continue;
    const e = evRows.get(k) || { rows: 0, withResult: 0, withLine: 0, dates: new Set(), fighters: new Set() };
    e.rows++;
    if (Number.isFinite(Number(r.result))) e.withResult++;
    if (r.line != null && Number.isFinite(Number(r.line))) e.withLine++;
    if (r.date) e.dates.add(String(r.date).slice(0, 10));
    e.fighters.add(r.fighter);
    evRows.set(k, e);
  }
  console.log('  EVENTS IN QUESTION:');
  console.table([...evRows.entries()].map(([ev, e]) => ({
    event: ev, rows: e.rows, 'with result': e.withResult, 'with line': e.withLine,
    fighters: e.fighters.size, dates: [...e.dates].sort().join(' , '),
    'FUTURE?': [...e.dates].every((d) => Date.parse(d) > NOW) ? 'YES — should have NO results' : 'no',
  })));

  // 2. Per watched fighter: every row on those events, beside their cached fights.
  for (const name of WATCH) {
    const rec = caches.get(nf(name));
    const rows = archive.filter((r) => r && nf(r.fighter) === nf(name) && EVENTS.includes(ne(r.event)));
    if (!rows.length) continue;
    console.log(`\n%c${name}`, 'font-weight:bold');
    console.log(`  cache: ${rec ? `${rec.name} · ${rec.fightHistory.length} fights` : 'NONE'}`);
    console.table(rows.map((r) => {
      const rowTs = Date.parse(String(r.date ?? ''));
      const near = rec ? rec.fightHistory.find((f) => {
        const fTs = Date.parse(String(f?.date ?? ''));
        return Number.isFinite(fTs) && Number.isFinite(rowTs) && Math.abs(fTs - rowTs) <= 2 * 864e5;
      }) : null;
      return {
        event: r.event, date: String(r.date ?? '').slice(0, 10),
        future: Number.isFinite(rowTs) && rowTs > NOW ? 'YES' : '',
        propType: r.propType, line: r.line ?? null, result: r.result,
        platform: r.platform || '',
        'cached fight that date': near ? near.event : 'NONE — fighter did not fight this card',
      };
    }));
  }
  console.log('\n%cA FUTURE-dated row carrying a line AND a result is a live line that was', 'color:#f85149');
  console.log('falsely settled. Its result must be CLEARED, not corrected — there is no');
  console.log('right value, because the fight has not happened. Backup before any such write.');
})();
