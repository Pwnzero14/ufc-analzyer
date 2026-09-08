/*
 * READ-ONLY archive sweep for WRONG-FIGHT ATTRIBUTION.
 *
 * The 2daecc0 guard stops updateResult writing one fight's stats onto another
 * fight's row, but cannot find rows already written that way. Those are
 * invisible to the ledger check, because the leg and the row simply agree with
 * each other. This looks at the archive on its own terms.
 *
 * SCOPE - formula-free propTypes ONLY: SS, TD, Control, FightTime. A probe that
 * re-derives the fantasy scoring table is what produced 2270 phantom findings in
 * the first version of this work, so Fantasy / Fantasy_PP are deliberately NOT
 * swept. That still leaves ~28.7k of 42.9k rows and includes SS, where all three
 * known victims were.
 *
 * Per row, against the fighter's ufcstats cache:
 *   - event IS in fightHistory  -> compare; a mismatch means the repair missed it
 *   - event NOT in fightHistory -> the row claims a fight the cache lacks.
 *     Benign if the cache predates the event. SUSPICIOUS if the cache is NEWER
 *     than the event (so it should contain the fight) AND the stored value
 *     exactly equals the value from exactly ONE other bout of that same fighter.
 *
 * DELIBERATE NARROWING, so this reports signal rather than arithmetic:
 *   - zero values skipped (0 control / 0 takedowns match almost everything)
 *   - TD excluded from the suspect test (0-5 collides constantly), still
 *     reported for direct mismatches
 *   - the matched value must be UNIQUE in that fighter's history; if two of
 *     their bouts share it, the match says nothing
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only.
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
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
  console.log('%c[attribution-sweep] READ-ONLY', 'font-weight:bold;font-size:13px');
  console.log('  archive rows:', archive.length);
  if (!archive.length) { console.warn('  empty archive - stop.'); return; }

  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const strip = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const aliasLC = {};
  for (const [k, v] of Object.entries(ALIASES)) aliasLC[strip(k).toLowerCase()] = strip(v).toLowerCase();
  const nf = (v) => { const s = strip(v).toLowerCase(); return aliasLC[s] || s; };

  const caches = new Map();
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('ufcstats_v51_') && v && v.name && Array.isArray(v.fightHistory)) caches.set(nf(v.name), v);
  }
  console.log('  cached fighters:', caches.size);

  // ctrlMinsOf mirrored from analyzer.ts:27294.
  const ctrlMins = (s) => Math.round((Number(s) / 60) * 100) / 100;
  const valueOf = (f, pt) => {
    switch (pt) {
      case 'ss': return f.sigStr == null ? null : Number(f.sigStr);
      case 'td': return f.td == null ? null : Number(f.td);
      case 'control': case 'ctrl': return f.ctrlSecs == null ? null : ctrlMins(f.ctrlSecs);
      case 'fighttime': return f.timeSecs == null ? null : Math.round((Number(f.timeSecs) / 60) * 100) / 100;
      default: return null;
    }
  };
  const SWEPT = new Set(['ss', 'td', 'control', 'ctrl', 'fighttime']);
  const SUSPECT_OK = new Set(['ss', 'control', 'ctrl', 'fighttime']);

  const buckets = {};
  const bump = (k) => { buckets[k] = (buckets[k] || 0) + 1; };
  const mismatches = [], suspects = [];

  for (const r of archive) {
    if (!r) continue;
    const pt = String(r.propType ?? '').toLowerCase();
    if (!SWEPT.has(pt)) { bump('skipped (formula or unswept propType)'); continue; }
    const stored = Number(r.result);
    if (!Number.isFinite(stored)) { bump('no result'); continue; }
    const rec = caches.get(nf(r.fighter));
    if (!rec) { bump('no cache for fighter'); continue; }

    const hist = rec.fightHistory;
    // Match by event text OR date. Event strings are NOT comparable across
    // sources: 'UFC Fight Night: Gilbert Burns vs Mike Malott' (platform row) and
    // 'UFC Fight Night: Burns vs. Malott' (UFCStats cache) are the same card, and
    // v1 of this sweep reported 735 of those as wrong-fight attribution. A fighter
    // has at most one bout per date, so the date test is the reliable one.
    const DATE_TOL_MS = 2 * 24 * 60 * 60 * 1000;
    const rowTs = Date.parse(String(r.date ?? ''));
    const own = hist.find((f) => {
      if (!f) return false;
      if (ne(f.event) === ne(r.event)) return true;
      const fTs = Date.parse(String(f.date ?? ''));
      return Number.isFinite(rowTs) && Number.isFinite(fTs) && Math.abs(fTs - rowTs) <= DATE_TOL_MS;
    });
    if (own) {
      const correct = valueOf(own, pt);
      if (correct == null) { bump('cached fight lacks this stat'); continue; }
      if (Math.abs(stored - correct) <= 0.02) { bump('OK - matches its own fight'); continue; }
      bump('MISMATCH vs its own fight');
      mismatches.push({ fighter: r.fighter, event: r.event, propType: r.propType,
        stored, correct, diff: +(stored - correct).toFixed(2), platform: r.platform || '' });
      continue;
    }

    const evTs = rowTs, fetched = Number(rec.fetchedAt);
    const cacheShouldHaveIt = Number.isFinite(evTs) && Number.isFinite(fetched) && fetched > evTs;
    if (!cacheShouldHaveIt) { bump('event not cached (cache predates it - benign)'); continue; }
    bump('event missing from a cache NEWER than the event');
    if (!SUSPECT_OK.has(pt)) continue;
    if (Math.abs(stored) <= 0.02) continue;
    const hits = hist.filter((f) => {
      const v = valueOf(f, pt);
      return v != null && Math.abs(v - stored) <= 0.02;
    });
    if (hits.length !== 1) continue;
    suspects.push({ fighter: r.fighter, 'row event': r.event, propType: r.propType, stored,
      'value belongs to': hits[0].event, 'that opponent': hits[0].opponent,
      'that date': hits[0].date, platform: r.platform || '' });
  }

  console.log('%c  buckets:', 'font-weight:bold', buckets);
  if (mismatches.length) {
    console.log('%c  ' + mismatches.length + ' row(s) disagree with their OWN cached fight - Repair from Cache should have fixed these:', 'color:#f85149');
    console.table(mismatches.slice(0, 60));
    if (mismatches.length > 60) console.log('  ...and ' + (mismatches.length - 60) + ' more (window.__sweep.mismatches)');
  } else console.log('%c  no row disagrees with its own cached fight.', 'color:#3fb950');

  if (suspects.length) {
    console.log('%c  ' + suspects.length + ' SUSPECTED wrong-fight attribution - value belongs to a different bout of the same fighter:', 'color:#f85149;font-weight:bold');
    console.table(suspects.slice(0, 60));
    if (suspects.length > 60) console.log('  ...and ' + (suspects.length - 60) + ' more (window.__sweep.suspects)');
  } else console.log('%c  no wrong-fight attribution found.', 'color:#3fb950');

  console.log('%c  A suspect is a LEAD, not a verdict - a fighter can legitimately repeat a', 'color:#d29922');
  console.log('  strike count. Confirm against the UFCStats fight page before changing anything.');
  window.__sweep = { buckets, mismatches, suspects };
})();
