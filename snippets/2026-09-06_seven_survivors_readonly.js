/*
 * READ-ONLY. The 7 legs that still disagree with the archive after the repair.
 *
 * Asks ONE question and does not answer it by arithmetic: for each of these
 * fighters, WHAT DOES THE LOCAL UFCSTATS CACHE ACTUALLY SAY about that fight?
 *
 * Three of the seven are SS, which is a raw UFCStats count with no scoring
 * formula anywhere in it — so the method-parse bug that motivated the repair
 * cannot explain them, and neither can the win-bonus tables. Do not reach for
 * those. Print the cached fight and read it.
 *
 * Specifically distinguishes:
 *   · NO CACHE AT ALL          -> the repair never touched the row; the archive
 *                                 value is the original and nothing here is
 *                                 evidence about which side is right.
 *   · CACHE, FIGHT NOT PRESENT -> same, and tells us a refetch is the fix.
 *   · CACHE WITH THE FIGHT     -> the archive should now EQUAL sigStr (for SS).
 *                                 If it does, the leg is simply stale and the
 *                                 open question is whether the cache is right,
 *                                 which only the UFCStats fight page settles.
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only.
 */
(async () => {
  'use strict';
  const WANT = [
    ['Jalin Turner',     'ufc 330: makhachev vs. machado garry',       'FP'],
    ['Kaue Fernandes',   'ufc 330: makhachev vs. machado garry',       'SS'],
    ['Mackenzie Dern',   'ufc 330: makhachev vs. machado garry',       'FP'],
    ['Carol Foro',       'ufc fight night: gamrot vs. salkilld',       'FP'],
    ['Lerryan Douglas',  'ufc fight night: hernandez vs. rodrigues',   'SS'],
    ['Marquel Mederos',  'ufc fight night: hernandez vs. rodrigues',   'SS'],
    ['Vitor Petrino',    'ufc fight night: hernandez vs. rodrigues',   'FP'],
  ];
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nf = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  const caches = new Map();
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('ufcstats_v51_') && v && v.name) caches.set(nf(v.name), { key: k, rec: v });
  }
  console.log('%c[seven-survivors] READ-ONLY', 'font-weight:bold;font-size:13px');
  console.log('  cached fighters:', caches.size);

  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
  const out = [];
  for (const [name, ev, stat] of WANT) {
    const c = caches.get(nf(name));
    const fights = c ? (c.rec.fightHistory || []) : [];
    const f = fights.find((x) => x && ne(x.event) === ev);
    const rows = archive.filter((r) => r && nf(r.fighter) === nf(name) && ne(r.event) === ev);
    out.push({
      fighter: name, stat,
      cache: !c ? 'NO CACHE' : !f ? `cached (${fights.length} fights) but NOT this one` : 'has the fight',
      fetchedAt: c && c.rec.fetchedAt ? new Date(c.rec.fetchedAt).toISOString().slice(0, 16) : null,
      sigStr: f ? f.sigStr : null, totStr: f ? f.totStr : null,
      td: f ? f.td : null, kd: f ? f.kd : null, ctrlSecs: f ? f.ctrlSecs : null,
      method: f ? f.method : null, round: f ? f.round : null, result: f ? f.result : null,
      opponent: f ? f.opponent : null,
      'archive rows here': rows.map((r) => `${r.propType}=${r.result}`).join(' · '),
    });
  }
  console.table(out);
  console.log('  For an SS row the archive result should now EQUAL sigStr. If it does, the');
  console.log('  repair did its job and the disagreement lives between the cache and reality —');
  console.log('  which only the UFCStats fight page can settle. Do not infer it from the numbers.');
  window.__seven = out;
})();
