/*
 * STEP 3 of 3 — WRITES best_picks_placed_v1 and parlay_placed_v1.
 * Run the BACKUP first (snippets/2026-09-06_STEP1_backup.js).
 *
 * Records two Pick6 slips at their ENTRY lines:
 *   A  2 legs $150 -> $405+ (2.7x)  2026-09-07 16:49
 *        Marwan Rahiki    OVER 39.5 SS
 *        Tommy Mcmillen   OVER 53.5 SS
 *   B  4 legs $40  -> $320+ (8x)    2026-09-07 17:28
 *        Djorden Santos   OVER 44.5 SS
 *        Rafa Garcia      OVER 59.5 SS
 *        Rongzhu          OVER 70.5 SS
 *        Yousri Belgaroui OVER 50.5 SS
 *
 * MERGES. Never replaces an event object and never touches another event.
 * Skips leg keys that already exist and dedupes parlays by signature, so a
 * re-run is a no-op. Prints before/after counts — "added legs: 0" on the FIRST
 * run means stop and re-diagnose, not success.
 *
 * The parlay signature and id format are copied from persistPlacedParlay
 * (analyzer.ts ~576): joined with ',' not '||', and carrying book and line since
 * 5cdde96. A hand-rolled signature that omits either wrongly reports a duplicate.
 *
 * Rongzhu is written under the UFCStats canonical mononym. Pick6 scrapes him as
 * "Rong Rongzhu" (their "R. Rongzhu" display read as two tokens) and the archive
 * holds exactly one row that way — the alias added this session collapses both,
 * so either spelling now resolves.
 *
 * Paste into the ANALYZER page console.
 */
(async () => {
  'use strict';
  const EV = 'noche ufc: silva vs. delgado';
  const PLACED = 'best_picks_placed_v1', PARLAY = 'parlay_placed_v1';

  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const mark = all['last_ledger_backup_v1'];
  const ageH = mark && mark.at ? (Date.now() - mark.at) / 3600000 : Infinity;
  if (!mark || !(ageH < 2)) {
    console.error('%cNO RECENT BACKUP. Run snippets/2026-09-06_STEP1_backup.js first.', 'color:#f85149;font-weight:bold');
    console.error(mark ? `  newest backup is ${ageH.toFixed(1)}h old; need < 2h` : '  no backup marker at all');
    return;
  }
  console.log('%c[placed-write]', 'font-weight:bold;font-size:13px', `backup ${ageH.toFixed(2)}h old — ok`);

  const A_AT = new Date('2026-09-07T16:49:00').getTime();
  const B_AT = new Date('2026-09-07T17:28:00').getTime();

  // name, opponent (Pick6 bare surname), line, slip, forceBookSuffix
  const SPEC = [
    ['Marwan Rahiki',    'McMillen',  39.5, 'A', true ],
    ['Tommy Mcmillen',   'Rahiki',    53.5, 'A', true ],
    ['Djorden Santos',   'Belgaroui', 44.5, 'B', false],
    ['Rafa Garcia',      'Rongzhu',   59.5, 'B', false],
    ['Rongzhu',          'Garcia',    70.5, 'B', false],
    ['Yousri Belgaroui', 'Santos',    50.5, 'B', true ],
  ];

  const placedAll = (all[PLACED] && typeof all[PLACED] === 'object' && !Array.isArray(all[PLACED]))
    ? { ...all[PLACED] } : {};
  const evLegs = { ...(placedAll[EV] || {}) };
  const legsBefore = Object.keys(evLegs).length;

  const report = [];
  let addedLegs = 0;
  for (const [name, opp, line, slip, suffix] of SPEC) {
    const bare = `${name}|over|ss`;
    const key = suffix ? `${bare}|pick6` : bare;
    if (Object.prototype.hasOwnProperty.call(evLegs, key)) {
      report.push({ key, action: 'SKIPPED — key already exists' });
      continue;
    }
    evLegs[key] = {
      name, pretty: name, dir: 'OVER', source: 'ss', statLabel: 'SS',
      line, book: 'pick6', bookLabel: 'Pick6',
      clip: `${name} OVER ${line} SS @ Pick6 (vs ${opp})`,
      opponent: opp, opponentRaw: opp,
      key, placedAt: slip === 'A' ? A_AT : B_AT,
    };
    report.push({ key, name, line, slip, opponent: opp, action: 'added' });
    addedLegs++;
  }
  placedAll[EV] = evLegs;

  // ── parlays ──────────────────────────────────────────────────────────────
  const mkLeg = (name, opp, line) => ({
    fighter: name, opponent: opp, dir: 'OVER', stat: 'ss', statLabel: 'SS',
    line, book: 'pick6', bookLabel: 'Pick6',
  });
  const slipLegs = (slip) => SPEC.filter((s) => s[3] === slip).map(([n, o, l]) => mkLeg(n, o, l));
  // EXACTLY persistPlacedParlay's sigOf — ',' separator, book and line included.
  const sigOf = (ls) => ls
    .map((l) => `${l.fighter.toLowerCase()}|${l.stat}|${String(l.dir).toLowerCase()}|${l.book ?? ''}|${l.line ?? ''}`)
    .sort().join(',');

  const parlayAll = (all[PARLAY] && typeof all[PARLAY] === 'object' && !Array.isArray(all[PARLAY]))
    ? { ...all[PARLAY] } : {};
  const list = Array.isArray(parlayAll[EV]) ? [...parlayAll[EV]] : [];
  const parlaysBefore = list.length;
  let addedParlays = 0;
  for (const [slip, at] of [['A', A_AT], ['B', B_AT]]) {
    const legs = slipLegs(slip);
    const sig = sigOf(legs);
    if (list.some((p) => sigOf(p.legs || []) === sig)) {
      report.push({ key: `parlay ${slip}`, action: 'SKIPPED — duplicate signature' });
      continue;
    }
    list.unshift({ id: `${at}_${Math.random().toString(36).slice(2, 7)}`, placedAt: at, legs });
    report.push({ key: `parlay ${slip}`, action: `added (${legs.length} legs)` });
    addedParlays++;
  }
  parlayAll[EV] = list.slice(0, 30);

  console.table(report);
  console.log(`  added legs: ${addedLegs} · added parlays: ${addedParlays}`);
  if (!addedLegs && !addedParlays) { console.log('%c  nothing to write (already recorded).', 'color:#3fb950'); return; }

  const err = await new Promise((res) => chrome.storage.local.set(
    { [PLACED]: placedAll, [PARLAY]: parlayAll }, () => res(chrome.runtime.lastError || null)));
  if (err) { console.error('%c  WRITE REJECTED:', 'color:#f85149;font-weight:bold', err.message || err); return; }

  // Read back — a set() callback fires whether or not the write survived.
  const chk = await new Promise((r) => chrome.storage.local.get([PLACED, PARLAY], r));
  const legsAfter = Object.keys(chk[PLACED]?.[EV] || {}).length;
  const parlaysAfter = (chk[PARLAY]?.[EV] || []).length;
  const otherEvents = Object.keys(chk[PLACED] || {}).length;
  console.log(`  read-back: legs ${legsBefore} -> ${legsAfter} · parlays ${parlaysBefore} -> ${parlaysAfter} · ${otherEvents} event key(s) present`);
  if (legsAfter !== legsBefore + addedLegs || parlaysAfter !== parlaysBefore + addedParlays) {
    console.error('%c  WRITE DID NOT PERSIST as expected.', 'color:#f85149;font-weight:bold');
    return;
  }
  console.log('%c  VERIFIED. Check Data -> Placed and Data -> Parlays.', 'color:#3fb950;font-weight:bold');
})();
