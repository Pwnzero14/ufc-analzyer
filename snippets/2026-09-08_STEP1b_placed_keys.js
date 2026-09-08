/*
 * STEP 1b — READ-ONLY, compact. The full dump's head scrolled off; this prints
 * only what the write must not guess, as plain text so nothing collapses.
 *
 * The event key is the sharp edge here: this card has appeared under TWO names
 * today — "UFC Fight Night: Jean Silva vs Jose Delgado" (lines_open_v1 eventKey)
 * and "Noche UFC: Silva vs. Delgado" (predictions panel). bestPicksEventKey() is
 * the event name LOWERCASED, and the ledger must use the SAME key the app will
 * use at settle. Dump it; never construct it.
 *
 * Paste into the ANALYZER page console.
 */
(async () => {
  'use strict';
  const WANT = ['rahiki', 'mcmillen', 'santos', 'garcia', 'rongzhu', 'belgaroui'];
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const hit = (v) => { const t = norm(v).split(' '); return WANT.some((w) => t.includes(w) || norm(v) === w); };
  const L = [];

  L.push('=== EVENT KEYS ===');
  L.push('placed : ' + JSON.stringify(Object.keys(all['best_picks_placed_v1'] || {})));
  L.push('parlay : ' + JSON.stringify(Object.keys(all['parlay_placed_v1'] || {})));
  const card = all['upcoming_ufc_card'];
  L.push('upcoming_ufc_card keys: ' + JSON.stringify(Object.keys(card || {})));
  for (const k of ['eventName', 'name', 'event', 'title', 'date']) {
    if (card && card[k] != null && typeof card[k] !== 'object') L.push(`upcoming_ufc_card.${k} = ${JSON.stringify(card[k])}`);
  }
  L.push('lines_open_v1.eventKey = ' + JSON.stringify(all['lines_open_v1']?.eventKey ?? null));
  const p6 = all['lines_pick6'];
  L.push('lines_pick6.eventName = ' + JSON.stringify(p6?.eventName ?? p6?.event ?? null));

  L.push('');
  L.push('=== CARD PAIRINGS (filtered on f1/f2 — the array is UFCFight[]) ===');
  for (const f of (Array.isArray(card?.fighters) ? card.fighters : [])) {
    if (hit(f?.f1) || hit(f?.f2)) L.push(`  ${f.f1}  VS  ${f.f2}   (${f.scheduledRounds ?? '?'}R ${f.weightClass ?? ''})`);
  }

  L.push('');
  L.push('=== PICK6 ROWS — clone name + opponent from HERE ===');
  const rows = Array.isArray(p6?.fighters) ? p6.fighters : (Array.isArray(p6) ? p6 : []);
  for (const f of rows) {
    const n = f?.name ?? f?.fighter;
    if (!hit(n)) continue;
    L.push(`  name=${JSON.stringify(n)} opponent=${JSON.stringify(f.opponent ?? null)} line_ss=${f.line_ss ?? f.ss ?? null} ml=${f.moneyline ?? null}`);
  }

  L.push('');
  L.push('=== EXISTING LEGS on each event key (bare-key collisions matter) ===');
  for (const [ev, legs] of Object.entries(all['best_picks_placed_v1'] || {})) {
    const ents = Object.entries(legs || {});
    L.push(`  "${ev}" — ${ents.length} leg(s)`);
    for (const [k, v] of ents) {
      if (!hit(v?.name) && !hit(k)) continue;
      L.push(`     ${k}  ->  name=${JSON.stringify(v.name)} line=${v.line} book=${JSON.stringify(v.book)} opp=${JSON.stringify(v.opponent)} oppRaw=${JSON.stringify(v.opponentRaw)}`);
    }
  }

  L.push('');
  L.push('=== ONE SAMPLE LEG (the write clones this SHAPE) ===');
  const anyEv = Object.values(all['best_picks_placed_v1'] || {})[0] || {};
  const sample = Object.entries(anyEv)[0];
  L.push(sample ? `  ${sample[0]}\n  ${JSON.stringify(sample[1], null, 1)}` : '  (no legs stored at all)');

  console.log(L.join('\n'));
})();
