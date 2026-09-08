/*
 * WRITES to prop_archive_v1. Relabels rows the removed 'Damon Jackson' ->
 * 'Donte Johnson' alias mis-filed (see 3f5282b).
 *
 * Run the BACKUP first: snippets/2026-09-06_STEP1_backup.js
 * This refuses to run without a backup marker less than 2 hours old, because
 * the archive has changed since yesterday's copy.
 *
 * It re-derives the classification itself rather than trusting a table pasted
 * into chat, and STOPS rather than guessing if anything is ambiguous:
 *
 *   - no Damon Jackson cache            -> stop (no ground truth to split on)
 *   - the two histories share a date    -> stop (date split not decisive)
 *   - a relabel would collide with an
 *     existing Damon Jackson row        -> skip that row, report it
 *
 * Only the `fighter` field changes. Results and lines are CORRECT as they
 * stand — Damon Jackson really did land those strikes; they are just filed
 * under the wrong man. Nothing is deleted and no value is recomputed.
 *
 * NOTE: this writes prop_archive_v1 directly, so do not run it while a scrape
 * or settle is in flight — those writers read-modify-write the same key.
 *
 * Paste into the ANALYZER page console.
 */
(async () => {
  'use strict';
  const all = await new Promise((r) => chrome.storage.local.get(null, r));

  const mark = all['last_ledger_backup_v1'];
  const ageH = mark && mark.at ? (Date.now() - mark.at) / 3600000 : Infinity;
  if (!mark || !(ageH < 2)) {
    console.error('%cNO RECENT BACKUP. Run snippets/2026-09-06_STEP1_backup.js first.', 'color:#f85149;font-weight:bold');
    console.error(mark ? `  newest backup is ${ageH.toFixed(1)}h old; need < 2h` : '  no backup marker at all');
    return;
  }
  console.log('%c[johnson-relabel]', 'font-weight:bold;font-size:13px', `backup ${ageH.toFixed(2)}h old — ok`);

  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
  if (!archive.length) { console.error('  empty archive — stop.'); return; }
  const nf = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const ne = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const TOL = 2 * 24 * 60 * 60 * 1000;

  const findCache = (name) => {
    for (const [k, v] of Object.entries(all)) {
      if (!k.startsWith('ufcstats_v51_')) continue;
      if (v && v.name && nf(v.name) === nf(name) && Array.isArray(v.fightHistory)) return v;
    }
    return null;
  };
  const donte = findCache('Donte Johnson');
  const damon = findCache('Damon Jackson');
  if (!damon) {
    console.error('%c  STOP. No Damon Jackson cache — no ground truth to split against.', 'color:#f85149;font-weight:bold');
    console.error("  Reload the extension, then: window.refetchFighters(['Damon Jackson', 'Donte Johnson'])");
    return;
  }
  const fightsOf = (rec) => (rec ? rec.fightHistory : []).map((f) => ({
    event: f.event, date: f.date, ts: Date.parse(String(f.date ?? '')),
  })).filter((x) => Number.isFinite(x.ts));
  const donteF = fightsOf(donte), damonF = fightsOf(damon);
  console.log(`  Donte: ${donteF.length} dated fights · Damon: ${damonF.length} dated fights`);

  const overlap = donteF.filter((a) => damonF.some((b) => Math.abs(a.ts - b.ts) <= TOL));
  if (overlap.length) {
    console.error('%c  STOP. Shared fight date — the date split is not decisive here:', 'color:#f85149');
    console.table(overlap);
    return;
  }

  // Existing Damon rows, so a relabel cannot silently create a duplicate key
  // (recordKey is fighter|event|platform|propType|day).
  const damonKeys = new Set(archive
    .filter((r) => r && nf(r.fighter) === nf('Damon Jackson'))
    .map((r) => `${ne(r.event)}|${r.platform || ''}|${String(r.propType).toLowerCase()}|${String(r.date ?? '').slice(0, 10)}`));

  const near = (list, ts) => list.find((f) => Number.isFinite(ts) && Math.abs(f.ts - ts) <= TOL) || null;
  const report = [];
  let relabelled = 0, collided = 0, kept = 0, unknown = 0;
  for (const r of archive) {
    if (!r || nf(r.fighter) !== nf('Donte Johnson')) continue;
    const ts = Date.parse(String(r.date ?? ''));
    const d = near(donteF, ts), j = near(damonF, ts);
    if (d && !j) { kept++; continue; }
    if (!(j && !d)) { unknown++; report.push({ event: r.event, date: String(r.date ?? '').slice(0,10), propType: r.propType, platform: r.platform || '', action: 'UNKNOWN — left alone' }); continue; }
    const key = `${ne(r.event)}|${r.platform || ''}|${String(r.propType).toLowerCase()}|${String(r.date ?? '').slice(0, 10)}`;
    if (damonKeys.has(key)) {
      collided++;
      report.push({ event: r.event, date: String(r.date ?? '').slice(0,10), propType: r.propType, platform: r.platform || '', action: 'COLLIDES with an existing Damon row — SKIPPED' });
      continue;
    }
    r.fighter = 'Damon Jackson';
    damonKeys.add(key);
    relabelled++;
    report.push({ event: r.event, date: String(r.date ?? '').slice(0,10), propType: r.propType,
      line: r.line ?? null, result: r.result, platform: r.platform || '', action: 'relabelled -> Damon Jackson' });
  }

  console.log(`  kept as Donte: ${kept} · relabelled: ${relabelled} · collisions skipped: ${collided} · unknown: ${unknown}`);
  if (report.length) console.table(report);
  if (!relabelled) { console.log('%c  nothing to write.', 'color:#3fb950'); return; }

  // v1 of this snippet reported "WROTE 36" against a write that never landed.
  // chrome.storage.local.set fires its callback whether or not the write
  // succeeded, so a rejected write reads as success — the same trap recorded in
  // [[project_storage_quota_silent_writes]]. Check lastError AND re-read.
  const before = await new Promise((r) => chrome.storage.local.getBytesInUse(null, r)).catch(() => null);
  const err = await new Promise((res) => chrome.storage.local.set({ prop_archive_v1: archive }, () => res(chrome.runtime.lastError || null)));
  if (err) {
    console.error('%c  WRITE REJECTED:', 'color:#f85149;font-weight:bold', err.message || err);
    console.error('  Nothing changed. bytesInUse before the attempt:', before);
    return;
  }
  // Trust nothing: read it back and count.
  const check = await new Promise((r) => chrome.storage.local.get(['prop_archive_v1'], r));
  const back = Array.isArray(check.prop_archive_v1) ? check.prop_archive_v1 : [];
  const damonNow = back.filter((r) => r && nf(r.fighter) === nf('Damon Jackson')).length;
  const donteNow = back.filter((r) => r && nf(r.fighter) === nf('Donte Johnson')).length;
  console.log(`  post-write read-back: ${back.length} rows · Damon Jackson ${damonNow} · Donte Johnson ${donteNow}`);
  if (damonNow < relabelled) {
    console.error('%c  WRITE DID NOT PERSIST.', 'color:#f85149;font-weight:bold',
      `expected >= ${relabelled} Damon Jackson rows, found ${damonNow}.`);
    console.error('  bytesInUse before the attempt:', before, '— check storage quota.');
    return;
  }
  console.log(`%c  VERIFIED: ${relabelled} row(s) relabelled and read back. Rows ${back.length}.`, 'color:#3fb950;font-weight:bold');
  console.log('  Re-run the attribution sweep; the Donte Johnson suspects should be gone.');
})();
