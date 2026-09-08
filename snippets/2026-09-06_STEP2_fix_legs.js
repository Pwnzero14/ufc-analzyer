/*
 * STEP 2 of 2 — WRITES to best_picks_placed_v1. Run STEP 1 first; this refuses
 * to run without the backup marker.
 *
 * Re-syncs the 4 placed legs whose frozen `actual` disagrees with the archive.
 * In all four the archive is the verified side:
 *
 *   Kaue Fernandes  SS  frozen 23   sigStr 2   (KO in R1 — confirmed by refetch)
 *   Lerryan Douglas SS  frozen  7   sigStr 14
 *   Marquel Mederos SS  frozen 110  sigStr 73
 *   Vitor Petrino   FP  frozen 114  99.01      (reconstructed to the cent:
 *                                    64*.4 + 62*.2 + 367*.03 + 4*5 + U-DEC 30)
 *
 * Their frozen values came from a DIFFERENT fight of the same fighter, via the
 * unguarded lone-candidate branch in PropArchiveService.updateResult (fixed in
 * 2daecc0). This corrects the record; it does not re-litigate the mechanism.
 *
 * Corrected values are READ FROM THE ARCHIVE, never hardcoded here — a value
 * transcribed into a snippet is a value that drifts.
 *
 * Outcome is recomputed with the app's own rule (analyzer.ts resolveVsArchive):
 *     hit = dir === 'over' ? actual > line : actual < line
 * THREE OF THESE FLIP A RECORDED HIT OR MISS. That is the point, but look at
 * the table before accepting it.
 */
(async () => {
  'use strict';
  const ALIASES = {
    "Jung Young Lee": "Jeongyeong Lee",
    "Jungyoung Lee": "Jeongyeong Lee",
    "Su Sumudaerji": "Su Mudaerji",
    "Sumudaerji Su": "Su Mudaerji",
    "Sumudaerji": "Su Mudaerji",
    "Yadong Song": "Song Yadong",
    "Yi Sak Lee": "Yisak Lee",
    "Qileng Aori": "Aoriqileng",
    "Aori Qileng": "Aoriqileng",
    "Aori Aoriqileng": "Aoriqileng",
    "Harris Carlston": "Carlston Harris",
    "Matthieu Letho Duclos": "Matthieu Duclos",
    "Daniel Hooker": "Dan Hooker",
    "Muhammadjon Naimov": "Muhammad Naimov",
    "Klaudia Syguła": "Klaudia Sygula",
    "Sergey Spivak": "Serghei Spivac",
    "Sergei Spivak": "Serghei Spivac",
    "Serghei Spivak": "Serghei Spivac",
    "Sergey Spivac": "Serghei Spivac",
    "Sergei Spivac": "Serghei Spivac",
    "Rong Rongzhu": "Rongzhu",
    "Xiong Jing Nan": "Xiong Jingnan",
    "Kangjie Zhu": "Zhu Kangjie",
    "Meng Ding": "Ding Meng",
    "Mingyang Zhang": "Zhang Mingyang",
    "Jingnan Xiong": "Xiong Jingnan",
    "Xiaonan Yan": "Yan Xiaonan",
    "Ce Liu": "Liu Ce",
    "Cong Wang": "Wang Cong",
    "Muhammad Said": "Muhammad Saidov",
    "Myktybek Orolbai": "Myktybek Orolbai Uulu",
    "Orolbai": "Myktybek Orolbai Uulu",
    "Jose Miguel Delgado": "Jose Delgado",
    "Jose M Delgado": "Jose Delgado",
    "Patricio Freire": "Patricio Pitbull",
    "Patricio Pitbull Freire": "Patricio Pitbull",
    "Loopy Godinez": "Lupita Godinez",
    "Paulo Henrique Costa": "Paulo Costa",
    "Paulo Henrique Da Silva Costa": "Paulo Costa",
    "Christopher Padilla": "Chris Padilla",
    "Azamat Murazakov": "Azamat Murzakanov",
    "A Murazakov": "Azamat Murzakanov",
    "Darya Zheleznyakova": "Daria Zhelezniakova",
    "Vinicius De Oliveira Prestes De Matos": "Vinicius Oliveira",
    "Vinicius De Oliveira": "Vinicius Oliveira",
    "Yadier Delvalle": "Yadier Del Valle",
    "Beatriz Mesquita": "Bia Mesquita",
    "Sharabutdin Magomedov": "Shara Magomedov",
    "Abusupiyan Magomedov": "Abus Magomedov",
    "Carlos Diego Ferreira": "Diego Ferreira"
  };
  const store = await new Promise((r) => chrome.storage.local.get(null, r));
  if (!store['last_ledger_backup_v1']) {
    console.error('%cNO BACKUP MARKER — run STEP 1 first. Refusing to write.', 'color:#f85149;font-weight:bold');
    return;
  }
  console.log('%c[fix-legs] backup found:', 'font-weight:bold', store['last_ledger_backup_v1']);

  const TARGETS = [
    ['Kaue Fernandes',  'ufc 330: makhachev vs. machado garry',     'SS'],
    ['Lerryan Douglas', 'ufc fight night: hernandez vs. rodrigues', 'SS'],
    ['Marquel Mederos', 'ufc fight night: hernandez vs. rodrigues', 'SS'],
    ['Vitor Petrino',   'ufc fight night: hernandez vs. rodrigues', 'FP'],
  ];

  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const strip = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const aliasLC = {};
  for (const [k, v] of Object.entries(ALIASES)) aliasLC[strip(k).toLowerCase()] = strip(v).toLowerCase();
  const nf = (v) => { const s = strip(v).toLowerCase(); return aliasLC[s] || s; };
  // Mirrors analyzer.ts normalizeArchiveResult — identity for SS and Fantasy,
  // but carried so this cannot diverge if it is reused for Control/FightTime.
  const normRes = (pt, r) => ((pt === 'FightTime' || pt === 'Control') && r > 25 ? r / 60 : r);

  const archive = Array.isArray(store['prop_archive_v1']) ? store['prop_archive_v1'] : [];
  const idx = new Map();
  for (const r of archive) {
    if (!r) continue;
    const k = `${nf(r.fighter)}|${ne(r.event)}|${String(r.propType ?? '').toLowerCase()}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(r);
  }
  const propFor = (leg) => {
    const s = String(leg.source || '').toLowerCase(), lbl = String(leg.statLabel || '').toLowerCase();
    const pp = String(leg.book || '').toLowerCase().includes('prizepick');
    if (s === 'fp' || lbl === 'fp') return pp ? ['fantasy_pp'] : ['fantasy'];
    if (lbl === 'r1 ss') return ['ss_r1'];
    if (lbl === 'kd') return ['kd'];
    if (s === 'ss' || lbl === 'ss') return ['ss'];
    if (s === 'td' || lbl === 'td') return ['td'];
    if (s === 'ctrl' || lbl === 'ctrl') return ['ctrl', 'control'];
    if (s === 'ft' || lbl === 'ft') return ['fighttime'];
    return null;
  };

  const placed = JSON.parse(JSON.stringify(store['best_picks_placed_v1'] || {}));
  const report = [];
  let writes = 0;
  for (const [name, ev, stat] of TARGETS) {
    const legs = placed[ev];
    if (!legs) { report.push({ fighter: name, stat, status: 'EVENT NOT IN LEDGER' }); continue; }
    let found = 0;
    for (const leg of Object.values(legs)) {
      if (!leg || nf(leg.name) !== nf(name)) continue;
      if (String(leg.statLabel || '').toLowerCase() !== stat.toLowerCase()) continue;
      found++;
      const props = propFor(leg);
      let row = null;
      if (props) for (const p of props) {
        const f = idx.get(`${nf(leg.name)}|${ne(ev)}|${p}`);
        if (f && f.length) { row = f[0]; break; }
      }
      if (!row) { report.push({ fighter: name, stat, status: 'NO ARCHIVE ROW — skipped' }); continue; }
      const before = Number(leg.actual);
      const after = normRes(String(row.propType), Number(row.result));
      if (!Number.isFinite(after)) { report.push({ fighter: name, stat, status: 'archive result not finite — skipped' }); continue; }
      const dir = String(leg.dir || '').toLowerCase();
      const line = Number(leg.line);
      const grade = (v) => (!Number.isFinite(line) ? null : (dir === 'over' ? v > line : v < line) ? 'hit' : 'miss');
      const oldOutcome = leg.outcome ?? null, newOutcome = grade(after);
      report.push({ fighter: name, stat, book: leg.bookLabel, dir, line,
        'actual before': before, 'actual after': +after.toFixed(2),
        'outcome before': oldOutcome, 'outcome after': newOutcome,
        FLIPS: oldOutcome && newOutcome && oldOutcome !== newOutcome ? 'YES' : '',
        status: Math.abs(before - after) <= 0.005 ? 'already correct' : 'will update' });
      if (Math.abs(before - after) > 0.005) {
        leg.actual = after;
        if (newOutcome) leg.outcome = newOutcome;
        leg.resolvedAt = Date.now();
        writes++;
      }
    }
    if (!found) report.push({ fighter: name, stat, status: 'LEG NOT FOUND' });
  }

  console.table(report);
  if (!writes) { console.log('%c  nothing to write.', 'color:#3fb950'); return; }
  await new Promise((r) => chrome.storage.local.set({ best_picks_placed_v1: placed }, r));
  console.log(`%c  WROTE ${writes} leg(s). Re-run the verify snippet — it should report 188/188.`,
    'color:#3fb950;font-weight:bold');
})();
