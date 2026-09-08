/*
 * STEP 1 of 3 — READ-ONLY DUMP. Run before writing anything.
 *
 * Recording two already-placed Pick6 slips at their ENTRY lines. The ✓ PLACED
 * button stamps whatever the board shows NOW, which would destroy the CLV
 * measurement — McMillen was taken at 53.5 and the board is 57.5.
 *
 *   Slip A  2 legs · $150 -> $405+ (2.7x)  placed ~4:49 PM
 *       M. Rahiki    MORE 39.5 SS
 *       T. McMillen  MORE 53.5 SS
 *   Slip B  4 legs · $40 -> $320+ (8x)     placed ~5:28 PM
 *       D. Santos    MORE 44.5 SS
 *       R. Garcia    MORE 59.5 SS
 *       R. Rongzhu   MORE 70.5 SS
 *       Y. Belgaroui MORE 50.5 SS
 *
 * This dump exists to answer the questions a write must NOT guess at:
 *   - the exact event key (LOWERCASED event name) — never construct it
 *   - canonical fighter spellings, cloned from what is already stored
 *   - each fighter's OPPONENT *in Pick6's format* (Pick6 stores a BARE SURNAME,
 *     Underdog stores the full name; the wrong one ghosts the leg at settle)
 *   - whether a bare leg key is already taken (then it needs a |pick6 suffix)
 *   - existing parlay signatures, which since 5cdde96 are
 *     fighter|stat|dir|book|line sorted+joined — book and line INCLUDED
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only.
 */
(async () => {
  'use strict';
  const WANT = ['rahiki', 'mcmillen', 'santos', 'garcia', 'rongzhu', 'belgaroui'];
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const surnameHit = (v) => WANT.some((w) => norm(v).split(' ').includes(w) || norm(v) === w);

  console.log('%c[placed-dump] READ-ONLY', 'font-weight:bold;font-size:13px');

  const placed = all['best_picks_placed_v1'] || {};
  const parlays = all['parlay_placed_v1'] || {};
  console.log('  best_picks_placed_v1 event keys:', Object.keys(placed));
  console.log('  parlay_placed_v1 event keys:', Object.keys(parlays));
  console.log('  upcoming_ufc_card name:', all['upcoming_ufc_card']?.eventName
    ?? all['upcoming_ufc_card']?.name ?? '(check the object)');

  // Card pairings. NOTE: fighters[] is UFCFight[] = {f1, f2, ...} — filtering on
  // `.name` matches NOTHING and looks like "these fighters aren't on the card".
  const card = all['upcoming_ufc_card'];
  const fights = Array.isArray(card?.fighters) ? card.fighters : [];
  console.log(`  card: ${fights.length} fight(s)`);
  console.table(fights
    .filter((f) => surnameHit(f?.f1) || surnameHit(f?.f2))
    .map((f) => ({ f1: f.f1, f2: f.f2, rounds: f.scheduledRounds, weight: f.weightClass })));

  // Pick6 rows — clone `opponent` from HERE, not from the card or another book.
  const p6 = all['lines_pick6'];
  const rows = Array.isArray(p6?.fighters) ? p6.fighters : (Array.isArray(p6) ? p6 : []);
  console.log('  PICK6 STORE (clone name + opponent from these):');
  console.table(rows.filter((f) => surnameHit(f?.name || f?.fighter)).map((f) => ({
    name: f.name ?? f.fighter, opponent: f.opponent ?? null,
    line_ss: f.line_ss ?? f.ss ?? null, moneyline: f.moneyline ?? null,
  })));

  // Existing legs on every event key, so a bare-key collision is visible.
  for (const [ev, legs] of Object.entries(placed)) {
    const entries = Object.entries(legs || {});
    const mine = entries.filter(([k, v]) => surnameHit(v?.name) || surnameHit(k));
    console.log(`  legs on "${ev}": ${entries.length} total, ${mine.length} touching these fighters`);
    if (mine.length) {
      console.table(mine.map(([k, v]) => ({ key: k, name: v.name, pretty: v.pretty, dir: v.dir,
        source: v.source, statLabel: v.statLabel, line: v.line, book: v.book, bookLabel: v.bookLabel,
        opponent: v.opponent, opponentRaw: v.opponentRaw, placedAt: v.placedAt ? new Date(v.placedAt).toLocaleString() : null })));
    }
    // One sample record whatever the fighter — the write clones this SHAPE.
    if (entries.length && !mine.length) {
      console.log(`    sample record shape from "${ev}":`, entries[0][1]);
    }
  }

  // Existing parlays + their signatures under the CURRENT rule.
  const sig = (legs) => (legs || []).map((l) =>
    `${String(l.fighter).toLowerCase()}|${l.stat}|${String(l.dir).toLowerCase()}|${l.book}|${l.line}`
  ).sort().join('  //  ');
  for (const [ev, list] of Object.entries(parlays)) {
    console.log(`  parlays on "${ev}": ${(list || []).length}`);
    (list || []).forEach((p, i) => console.log(`    [${i}] ${p.legs?.length} legs · ${p.placedAt ? new Date(p.placedAt).toLocaleString() : '?'} · sig ${sig(p.legs)}`));
  }

  console.log('%c  Next: 💾 Backup, then STEP 2 (dry run), then STEP 3 (write).', 'color:#d29922;font-weight:bold');
  window.__placedDump = { placed, parlays, rows, fights };
})();
