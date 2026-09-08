/*
 * READ-ONLY verification of the ⟳ Repair from Cache pass.  v2
 *
 * v1 produced 40+ phantom findings from THREE defects of its own, all of which
 * are the house specialities:
 *   · It did not apply NAME_ALIASES, so Orolbai and Su Mudaerji came back as
 *     "no archive row". That is the FIFTH probe in this project to do exactly
 *     that, and the third to do it to those same two fighters. The alias map
 *     below is GENERATED from src/config/index.ts, never hand-copied.
 *   · It had no mapping for SS_R1 or KD, so ~30 real rows read "UNMAPPED".
 *   · Its 0.005 tolerance was tighter than the precision legs were frozen at,
 *     so 132 vs 132.03 was reported as a disagreement.
 *
 * It still does NOT recompute fantasy scores — re-deriving the scoring table in
 * a probe produced 2270 phantom findings once already.
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
  console.log('%c[repair-verify v2] READ-ONLY', 'font-weight:bold;font-size:13px');
  console.log('  archive rows:', archive.length);
  if (!archive.length) { console.warn('  empty archive — stop.'); return; }

  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const strip = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const aliasLC = {};
  for (const [k, v] of Object.entries(ALIASES)) aliasLC[strip(k).toLowerCase()] = strip(v).toLowerCase();
  const nf = (v) => { const s = strip(v).toLowerCase(); return aliasLC[s] || s; };

  // EVIDENCE, not assumption: what propTypes does this archive actually hold?
  const ptCounts = {};
  for (const r of archive) if (r) ptCounts[String(r.propType)] = (ptCounts[String(r.propType)] || 0) + 1;
  console.log('  propTypes present in the archive:', ptCounts);

  const idx = new Map();
  for (const r of archive) {
    if (!r) continue;
    const k = `${nf(r.fighter)}|${ne(r.event)}|${String(r.propType ?? '').toLowerCase()}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(r);
  }

  const propFor = (leg) => {
    const s = String(leg.source || '').toLowerCase();
    const lbl = String(leg.statLabel || '').toLowerCase();
    const pp = String(leg.book || '').toLowerCase().includes('prizepick');
    if (s === 'fp' || lbl === 'fp') return pp ? ['fantasy_pp'] : ['fantasy'];
    if (lbl === 'r1 ss' || s === 'ssr1' || s === 'ss_r1') return ['ss_r1'];
    if (lbl === 'kd' || s === 'kd') return ['kd'];
    if (s === 'ss' || lbl === 'ss') return ['ss'];
    if (s === 'td' || lbl === 'td') return ['td'];
    if (s === 'ctrl' || lbl === 'ctrl') return ['ctrl', 'control'];
    if (s === 'ft' || lbl === 'ft') return ['fighttime'];
    return null;
  };

  const placed = all['best_picks_placed_v1'];
  const real = [], rounding = [], missing = [], unmapped = [];
  let agree = 0, total = 0;
  if (placed && typeof placed === 'object') {
    for (const [evKey, legs] of Object.entries(placed)) {
      if (!legs || typeof legs !== 'object') continue;
      for (const leg of Object.values(legs)) {
        if (!leg || typeof leg !== 'object') continue;
        if (leg.actual == null || !Number.isFinite(Number(leg.actual))) continue;
        total++;
        const props = propFor(leg);
        let hit = null;
        if (props) for (const p of props) {
          const f = idx.get(`${nf(leg.name)}|${ne(evKey)}|${p}`);
          if (f && f.length) { hit = f[0]; break; }
        }
        const row = { fighter: leg.name, event: evKey, stat: leg.statLabel, book: leg.bookLabel,
          'leg actual': Number(leg.actual), 'archive result': hit ? Number(hit.result) : null,
          diff: hit ? +(Number(hit.result) - Number(leg.actual)).toFixed(3) : null, outcome: leg.outcome };
        if (!props) { unmapped.push(row); continue; }
        if (!hit) { missing.push(row); continue; }
        const d = Math.abs(Number(hit.result) - Number(leg.actual));
        // 0.06 clears display rounding (values frozen at 1-2 dp) without hiding
        // a real stat term, the smallest of which is 1 (a knockdown counts 1).
        if (d <= 0.06) { agree++; continue; }
        (d < 0.5 ? rounding : real).push(row);
      }
    }
  }

  console.log(`  placed legs with a frozen actual: ${total} — ${agree} agree with the archive`);
  if (unmapped.length) { console.log('%c  STILL UNMAPPED (probe gap, not a data defect):', 'color:#d29922'); console.table(unmapped); }
  if (missing.length) { console.log('%c  no archive row (row pulled or never written — the repair cannot fix these):', 'color:#d29922'); console.table(missing); }
  if (rounding.length) { console.log('  sub-0.5 differences (precision, shown so they are not hidden):'); console.table(rounding); }
  if (real.length) { console.log('%c  REAL DISAGREEMENTS — leg frozen at one value, archive now says another:', 'color:#f85149'); console.table(real); }
  else console.log('%c  no real disagreements.', 'color:#3fb950');
  window.__repairVerify = { total, agree, real, rounding, missing, unmapped, ptCounts };
})();
