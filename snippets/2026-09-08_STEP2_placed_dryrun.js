/*
 * STEP 2 of 3 — DRY RUN. READ-ONLY. Builds the exact records and shows them.
 * WRITES NOTHING.
 *
 * Resolves the one open question before any write: RONGZHU'S SPELLING.
 *   card         -> "Rongzhu"
 *   lines_pick6  -> "Rong Rongzhu"   (changed after the baseline was taken —
 *                   the opening-line key is p6|ss|rongzhu, which is why his
 *                   current line read null in the opener check)
 * A placed leg only grades if settle can find a matching archive row, so the
 * spelling must be the one the ARCHIVE uses for this event. This prints those
 * rows and picks accordingly instead of guessing.
 *
 * Decisions already fixed by the STEP 1b dump:
 *   event key  "noche ufc: silva vs. delgado"   (dumped, not constructed)
 *   opponents  bare surname — Pick6's format, cloned from lines_pick6
 *   keys       |pick6 suffix ONLY where the bare key is taken by an existing
 *              Underdog leg (Rahiki, McMillen, Belgaroui). Santos, Garcia and
 *              Rongzhu have free bare keys, matching the 2026-09-01 precedent.
 *   names      cloned from the PLACED store where a record exists (note it
 *              holds "Tommy Mcmillen", not the card's "Tommy McMillen")
 *
 * Paste into the ANALYZER page console.
 */
(async () => {
  'use strict';
  const EV = 'noche ufc: silva vs. delgado';
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const placed = all['best_picks_placed_v1'] || {};
  const evLegs = placed[EV] || {};
  const p6rows = Array.isArray(all['lines_pick6']?.fighters) ? all['lines_pick6'].fighters : [];
  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];

  console.log('%c[placed-dryrun] READ-ONLY — nothing is written', 'font-weight:bold;font-size:13px');

  // ── Rongzhu spelling, decided by evidence ────────────────────────────────
  const rz = archive.filter((r) => r && /rongzhu/i.test(String(r.fighter)));
  const byName = {};
  for (const r of rz) byName[r.fighter] = (byName[r.fighter] || 0) + 1;
  console.log('  ARCHIVE rows matching /rongzhu/:', byName);
  const rzThisEvent = rz.filter((r) => /silva|delgado|noche/i.test(String(r.event)));
  console.log('  ...on this event:', rzThisEvent.map((r) => `${r.fighter} | ${r.event} | ${r.propType} | line ${r.line}`));
  const rzName = Object.keys(byName).sort((a, b) => byName[b] - byName[a])[0]
    || (p6rows.find((f) => /rongzhu/i.test(String(f.name)))?.name ?? 'Rongzhu');
  console.log(`%c  -> using "${rzName}" for Rongzhu`, 'color:#d29922;font-weight:bold');

  const p6 = (sn) => p6rows.find((f) => new RegExp(sn, 'i').test(String(f.name ?? '')));
  const nameFor = (sn, fallback) => {
    const existing = Object.values(evLegs).find((v) => new RegExp(sn, 'i').test(String(v?.name ?? '')));
    return existing ? existing.name : fallback;   // placed store wins on spelling
  };

  // fighter, opponent(bare, from Pick6), line, slip
  const LEGS = [
    { sn: 'rahiki',    name: nameFor('rahiki', p6('rahiki')?.name),       opp: p6('rahiki')?.opponent,    line: 39.5, slip: 'A' },
    { sn: 'mcmillen',  name: nameFor('mcmillen', p6('mcmillen')?.name),   opp: p6('mcmillen')?.opponent,  line: 53.5, slip: 'A' },
    { sn: 'santos',    name: nameFor('santos', p6('santos')?.name),       opp: p6('santos')?.opponent,    line: 44.5, slip: 'B' },
    { sn: 'garcia',    name: nameFor('garcia', p6('garcia')?.name),       opp: p6('garcia')?.opponent,    line: 59.5, slip: 'B' },
    { sn: 'rongzhu',   name: rzName,                                       opp: p6('rongzhu')?.opponent,   line: 70.5, slip: 'B' },
    { sn: 'belgaroui', name: nameFor('belgaroui', p6('belgaroui')?.name), opp: p6('belgaroui')?.opponent, line: 50.5, slip: 'B' },
  ];

  const out = [];
  for (const l of LEGS) {
    const bare = `${l.name}|over|ss`;
    const taken = Object.prototype.hasOwnProperty.call(evLegs, bare);
    const key = taken ? `${bare}|pick6` : bare;
    const dupe = Object.prototype.hasOwnProperty.call(evLegs, key);
    out.push({
      slip: l.slip, key, 'bare taken': taken ? `yes (${evLegs[bare].book} @ ${evLegs[bare].line})` : 'no',
      name: l.name, opponent: l.opp, line: l.line,
      'WOULD SKIP (already exists)': dupe ? 'YES' : '',
      'name resolved': l.name ? '' : 'MISSING — stop',
      'opp resolved': l.opp ? '' : 'MISSING — stop',
    });
  }
  console.table(out);

  const placedAtA = new Date('2026-09-07T16:49:00').getTime();
  const placedAtB = new Date('2026-09-07T17:28:00').getTime();
  console.log('  placedAt A:', new Date(placedAtA).toLocaleString(), '· B:', new Date(placedAtB).toLocaleString());

  const sig = (legs) => legs.map((l) => `${l.name.toLowerCase()}|ss|over|pick6|${l.line}`).sort().join('||');
  const A = LEGS.filter((l) => l.slip === 'A'), B = LEGS.filter((l) => l.slip === 'B');
  console.log('  slip A signature:', sig(A));
  console.log('  slip B signature:', sig(B));
  const existing = (all['parlay_placed_v1'] || {})[EV] || [];
  const esig = (p) => (p.legs || []).map((l) => `${String(l.fighter).toLowerCase()}|${l.stat}|${String(l.dir).toLowerCase()}|${l.book}|${l.line}`).sort().join('||');
  console.log(`  existing parlays on "${EV}": ${existing.length}`);
  existing.forEach((p, i) => console.log(`    [${i}] ${esig(p)}`));
  console.log('  slip A duplicate?', existing.some((p) => esig(p) === sig(A)));
  console.log('  slip B duplicate?', existing.some((p) => esig(p) === sig(B)));

  const bad = out.filter((r) => r['name resolved'] || r['opp resolved']).length;
  console.log(bad ? `%c  ${bad} leg(s) unresolved — DO NOT WRITE.` : '%c  all legs resolved.',
    bad ? 'color:#f85149;font-weight:bold' : 'color:#3fb950');
  window.__dry = { LEGS, out, placedAtA, placedAtB };
})();
