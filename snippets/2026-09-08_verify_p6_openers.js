/*
 * READ-ONLY. Checks the stored Pick6 SS OPENING lines against the Discord alert
 * that announced them.
 *
 * WHY: fetching after a line has moved stores the POST-move value as the open —
 * see [[project_late_fetch_anchors_baselines]]. The Discord alert history is the
 * only independent record of what the opener actually was.
 *
 * GROUND TRUTH BELOW is transcribed from the "DraftKings Pick6 — UFC SIGNIFICANT
 * STRIKES ARE UP" alert (2026-09-07 4:48 PM), which is the FIRST posting for
 * this card. A later 6:08 PM alert reports moves; anything fetched after it can
 * carry a moved value in the opener slot.
 *
 * Matched by SURNAME, because the alert abbreviates first names ("R. Tarin",
 * "T. McMillen") and guessing the full name is exactly the kind of
 * transcription error that has produced false findings in this project. A
 * surname that hits more than one fighter on the card is reported as AMBIGUOUS
 * rather than guessed.
 *
 * WRITES NOTHING. Repairing an opener is a separate, backup-first operation, and
 * per the memory above it must never CREATE a baseline key that does not exist —
 * only correct one that does.
 *
 * Paste into the ANALYZER page console.
 */
(async () => {
  'use strict';
  // surname -> opening SS line, from the 4:48 PM alert
  const OPENERS = {
    rongzhu: 70.5,
    garcia: 59.5,
    tarin: 69.5,
    fiorot: 63.5,
    grasso: 44.5,
    mcmillen: 53.5,
    delgado: 53.5,
    silva: 43.5,
    belgaroui: 50.5,
    santos: 44.5,
    aldrich: 49.5,
    acosta: 40.5,   // Cortes Acosta
  };

  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const open = all['lines_open_v1'];
  const p6 = all['lines_pick6'];
  console.log('%c[p6-opener-check] READ-ONLY', 'font-weight:bold;font-size:13px');
  if (!open || !open.lines) { console.error('  no lines_open_v1 — nothing to check.'); return; }
  console.log('  baseline captured:', open.capturedAt ? new Date(open.capturedAt).toLocaleString() : '?',
    '· eventKey:', open.eventKey, '· forBetrEventDate:', open.forBetrEventDate ?? '(none)');

  const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const surname = (v) => { const p = norm(v).split(' ').filter(Boolean); return p[p.length - 1] || ''; };

  // Current board lines, so a difference can be read as "moved" vs "wrong open".
  const current = new Map();
  const fighters = p6 && Array.isArray(p6.fighters) ? p6.fighters : (Array.isArray(p6) ? p6 : []);
  for (const f of fighters) {
    const n = f && (f.name || f.fighter);
    if (!n) continue;
    const ss = f.line_ss ?? f.ss ?? null;
    if (ss != null) current.set(norm(n), Number(ss));
  }
  console.log(`  pick6 store: ${fighters.length} fighter(s), ${current.size} with an SS line`);

  // Every p6|ss| baseline key present.
  const baselines = new Map();
  for (const [k, v] of Object.entries(open.lines)) {
    const m = /^p6\|ss\|(.+)$/.exec(k);
    if (m) baselines.set(norm(m[1]), Number(v));
  }
  console.log(`  baselines: ${baselines.size} p6|ss key(s)`);

  const rows = [];
  for (const [sn, want] of Object.entries(OPENERS)) {
    const hits = [...baselines.keys()].filter((n) => surname(n) === sn);
    if (!hits.length) {
      rows.push({ surname: sn, 'alert open': want, 'stored open': null, 'current line': null,
        verdict: 'NO BASELINE KEY — do not create one, investigate' });
      continue;
    }
    if (hits.length > 1) {
      rows.push({ surname: sn, 'alert open': want, 'stored open': null, 'current line': null,
        verdict: `AMBIGUOUS — ${hits.length} fighters match: ${hits.join(' / ')}` });
      continue;
    }
    const who = hits[0];
    const stored = baselines.get(who);
    const cur = current.has(who) ? current.get(who) : null;
    const same = Math.abs(Number(stored) - Number(want)) < 0.001;
    rows.push({
      fighter: who, surname: sn, 'alert open': want, 'stored open': stored, 'current line': cur,
      moved: cur == null ? '' : (Math.abs(cur - want) < 0.001 ? 'no' : `${want} -> ${cur}`),
      verdict: same ? 'OK — opener matches the alert'
        : `WRONG OPEN — stored ${stored}, alert says ${want}`,
    });
  }
  console.table(rows);
  const bad = rows.filter((r) => String(r.verdict).startsWith('WRONG OPEN')).length;
  const missing = rows.filter((r) => String(r.verdict).startsWith('NO BASELINE')).length;
  console.log(`  ${rows.length - bad - missing} ok · ${bad} wrong open · ${missing} missing baseline`);
  if (bad) console.log('%c  A WRONG OPEN means the fetch landed after the move and anchored the post-move value.', 'color:#d29922');
  console.log('  Nothing was written. Repair is backup-first and corrects existing keys only.');
  window.__p6open = rows;
})();
