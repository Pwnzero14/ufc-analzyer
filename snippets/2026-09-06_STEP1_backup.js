/*
 * STEP 1 of 2 — BACKUP. Run this and confirm the download BEFORE the fix.
 *
 * Line data in this project is irreplaceable: four events were lost for good in
 * April, and the placed ledger is the only record of what was actually staked.
 * The fix in STEP 2 refuses to run unless the marker this writes is present.
 *
 * Produces TWO copies, deliberately:
 *   · a downloaded .json file — survives the extension being removed, which is
 *     how the April data was lost. This is the one that matters.
 *   · an in-storage copy of the LEDGER only (small) for quick restore.
 *     The 42,880-row archive is NOT copied into storage; it would double the
 *     footprint, and a backup that dies with its storage is not a backup.
 *
 * Paste into the ANALYZER page console.
 */
(async () => {
  'use strict';
  const KEYS = ['best_picks_placed_v1', 'prop_archive_v1', 'parlay_placed_v1'];
  const all = await new Promise((r) => chrome.storage.local.get(KEYS, r));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const counts = {};
  for (const k of KEYS) {
    const v = all[k];
    counts[k] = Array.isArray(v) ? `${v.length} rows`
      : v && typeof v === 'object' ? `${Object.keys(v).length} events`
      : v === undefined ? 'ABSENT' : typeof v;
  }
  console.log('%c[backup] contents', 'font-weight:bold;font-size:13px', counts);
  if (!all['best_picks_placed_v1']) {
    console.error('  best_picks_placed_v1 is ABSENT — stop and do not run STEP 2.');
    return;
  }

  const payload = JSON.stringify({ savedAt: Date.now(), stamp, keys: KEYS, data: all });
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ufc-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  const markerKey = `backup_placed_${stamp}`;
  await new Promise((r) => chrome.storage.local.set({
    [markerKey]: all['best_picks_placed_v1'],
    last_ledger_backup_v1: { at: Date.now(), stamp, key: markerKey, size: payload.length },
  }, r));

  console.log(`  downloaded ufc-backup-${stamp}.json (${(payload.length / 1048576).toFixed(2)} MB)`);
  console.log(`  in-storage ledger copy: ${markerKey}`);
  console.log('%c  CHECK YOUR DOWNLOADS FOLDER before running STEP 2.', 'color:#d29922;font-weight:bold');
})();
