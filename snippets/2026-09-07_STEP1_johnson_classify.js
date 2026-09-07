/*
 * READ-ONLY. Classifies every archive row filed under "Donte Johnson".
 *
 * NAME_ALIASES carried 'Damon Jackson' -> 'Donte Johnson' (removed 3f5282b),
 * merging two real fighters:
 *     Damon "The Leech" Jackson   featherweight  23-9-1, 14 UFC fights
 *     Donte "Lockjaw" Johnson     middleweight    9-0-0
 * Rows written while it was live say "Donte Johnson" regardless of whose fight
 * they describe. Removing the alias does not undo that.
 *
 * PREREQUISITE — run this FIRST, after reloading the extension:
 *     window.refetchFighters(['Damon Jackson', 'Donte Johnson'])
 * Without a real Damon Jackson cache there is no ground truth to decide against,
 * and this will say so rather than guess.
 *
 * The decision is made by DATE against each fighter's own cached history, never
 * by reading the numbers. A fighter has one bout per date, and these two have
 * no overlapping fight dates, so the split is unambiguous where a cache covers
 * it. Anything covered by neither cache is reported as UNKNOWN and left alone —
 * this project has repeatedly turned "I can't explain it" into a wrong write.
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only.
 */
(async () => {
  'use strict';
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const archive = Array.isArray(all['prop_archive_v1']) ? all['prop_archive_v1'] : [];
  const nf = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
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

  console.log('%c[johnson-classify] READ-ONLY', 'font-weight:bold;font-size:13px');
  const show = (label, rec) => console.log(`  ${label}: ${rec ? `${rec.name} · ${rec.fightHistory.length} fights · fetched ${rec.fetchedAt ? new Date(rec.fetchedAt).toISOString().slice(0,16) : '?'}` : 'NO CACHE'}`);
  show('Donte Johnson', donte);
  show('Damon Jackson', damon);
  if (!damon) {
    console.error('%c  STOP. No Damon Jackson cache — there is no ground truth to split against.', 'color:#f85149;font-weight:bold');
    console.error("  Reload the extension, then run: window.refetchFighters(['Damon Jackson', 'Donte Johnson'])");
    return;
  }
  const fightsOf = (rec) => (rec ? rec.fightHistory : []).map((f) => ({
    event: f.event, date: f.date, ts: Date.parse(String(f.date ?? '')), opponent: f.opponent,
  })).filter((x) => Number.isFinite(x.ts));
  const donteF = fightsOf(donte), damonF = fightsOf(damon);
  console.log('  Donte fight dates:', donteF.map((f) => String(f.date)).join(' | ') || '(none)');
  console.log('  Damon fight dates:', damonF.map((f) => String(f.date)).join(' | ') || '(none)');

  const overlap = donteF.filter((a) => damonF.some((b) => Math.abs(a.ts - b.ts) <= TOL));
  if (overlap.length) {
    console.error('%c  STOP. The two histories share a date — the date split is NOT safe here:', 'color:#f85149');
    console.table(overlap);
    return;
  }

  const rows = archive.filter((r) => r && nf(r.fighter) === nf('Donte Johnson'));
  const near = (list, ts) => list.find((f) => Number.isFinite(ts) && Math.abs(f.ts - ts) <= TOL) || null;
  const buckets = { 'DONTE — keep': 0, 'DAMON — relabel': 0, 'UNKNOWN — leave alone': 0 };
  const detail = [];
  for (const r of rows) {
    const ts = Date.parse(String(r.date ?? ''));
    const d = near(donteF, ts), j = near(damonF, ts);
    const verdict = d && !j ? 'DONTE — keep' : j && !d ? 'DAMON — relabel' : 'UNKNOWN — leave alone';
    buckets[verdict]++;
    detail.push({ event: r.event, date: String(r.date ?? '').slice(0, 10), propType: r.propType,
      line: r.line ?? null, result: r.result, platform: r.platform || '',
      'matches Donte fight': d ? d.event : '', 'matches Damon fight': j ? j.event : '', verdict });
  }
  console.log(`\n  rows filed under "Donte Johnson": ${rows.length}`);
  console.log('  verdicts:', buckets);
  console.table(detail);
  console.log('\n%c  Only "DAMON — relabel" rows get rewritten, and only their `fighter` field.', 'color:#d29922');
  console.log('  Results and lines are NOT touched: the values are correct, they are just');
  console.log('  filed under the wrong man.');
  window.__johnson = { rows: detail, buckets, donteF, damonF };
})();
