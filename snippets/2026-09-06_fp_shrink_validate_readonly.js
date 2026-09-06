/*
 * READ-ONLY validation of MODEL v45 — FP thin-history shrinkage.
 *
 * Same construction as 2026-09-03_fp_sample_size_readonly.js (chronological
 * (n, priorAvg, actual) triples per fighter) with a THIRD arm, so all three
 * predictors are scored on IDENTICAL fights rather than different samples:
 *     personal = mean of that fighter's PRIOR fights
 *     league   = the league mean, measured over the same population
 *     shrunk   = (prior*n + 69.4*3)/(n + 3)   — exactly what shipped
 *
 * The paired t is on (personal error - shrunk error), the same shape as the
 * pre-registered test that motivated the change.
 *
 * RESULT 2026-09-06, 2254 pairs / 370 fighters:
 *     n=1     277  personal 41.0  league 36.5  SHRUNK 35.9  gain 5.11  t 3.23
 *     n=2     252           39.1         35.6         35.6       3.47  t 3.47
 *     n=1-2   529           40.1         36.0         35.8       4.33  t 4.53
 *     n=3-5   589           34.6         33.6         33.3       1.31  t 3.51
 *     n=6-9   515           35.7         35.6         35.2       0.48  t 2.41
 *     n>=10   621           37.0         37.3         36.9       0.13  t 1.43
 * Shrunk beats or ties both arms in every bucket; NO bucket came back worse than
 * the personal average, which was the main risk of over-shrinking experienced
 * fighters. League mean re-measured 70.2, cross-validating the shipped 69.4.
 *
 * *** NOT AN OUT-OF-SAMPLE TEST. *** K=3 was chosen from the measured crossover
 * (n~6) rather than fitted to minimise MAE, but it was chosen with the first
 * measurement already in view. This is confirmation on a larger sample, not
 * independent replication — do not quote these t-statistics as the latter.
 *
 * FANTASY_SCORING is copied from config/index.ts and fuzz-verified against
 * calcFPForPlatform earlier in this series. Do NOT hand-transcribe a scoring
 * table: v1 of the archive-FP series invented one and produced 2270 phantom
 * findings.
 *
 * Paste into the ANALYZER page console. chrome.storage.local.get only; no writes.
 */
(async () => {
  'use strict';
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  const caches = [];
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('ufcstats_v51_') && v && Array.isArray(v.fightHistory)) caches.push(v);
  }
  console.log('%c[fp-shrink-validate] READ-ONLY', 'font-weight:bold;font-size:13px');
  console.log('  cached fighters:', caches.length);
  if (!caches.length) { console.warn('  no caches — stop.'); return; }

  const F = { sig: 0.4, nonSig: 0.2, ctrl: 0.03, td: 5, rev: 5, kd: 10, quick: 25,
    wb: { r1: 90, r2: 70, r3: 45, r4: 40, dec: 30 } };
  const fp = (h) => {
    if (h.sigStr == null) return null;
    const won = String(h.result).toLowerCase() === 'win';
    const nonSig = Math.max(0, Number(h.totStr || 0) - Number(h.sigStr || 0));
    const b = !won ? 0 : /DEC/i.test(h.method || '') ? F.wb.dec
      : ((h.round || 3) === 1 ? F.wb.r1 : (h.round || 3) === 2 ? F.wb.r2 : (h.round || 3) === 3 ? F.wb.r3 : F.wb.r4);
    let v = Number(h.sigStr || 0) * F.sig + nonSig * F.nonSig + Number(h.ctrlSecs || 0) * F.ctrl
      + Number(h.kd || 0) * F.kd + Number(h.td || 0) * F.td + Number(h.rev || 0) * F.rev + b;
    if (won && /KO|TKO|SUB/i.test(h.method || '') && (h.round || 0) === 1
      && (h.timeSecs == null ? 9999 : Number(h.timeSecs)) <= 60) v += F.quick;
    return Math.round(v * 100) / 100;
  };

  const rows = [];
  const allFp = [];
  for (const c of caches) {
    const hist = (c.fightHistory || [])
      .map((h) => ({ h, t: Date.parse(h.date), v: fp(h) }))
      .filter((x) => Number.isFinite(x.t) && x.v != null)
      .sort((a, b) => a.t - b.t);
    for (const x of hist) allFp.push(x.v);
    let sum = 0;
    for (let i = 0; i < hist.length; i++) {
      if (i > 0) rows.push({ n: i, prior: sum / i, actual: hist[i].v });
      sum += hist[i].v;
    }
  }
  if (!rows.length) { console.warn('  no usable fight pairs — stop.'); return; }

  // Measured over the SAME population the buckets are scored on, so the two
  // baselines are compared on identical fights.
  const leagueMean = allFp.reduce((a, b) => a + b, 0) / allFp.length;
  console.log('  fight pairs:', rows.length, '| league mean measured here:',
    leagueMean.toFixed(1), '(shipped constant: 69.4)');

  const K = 3, M = 69.4;                        // exactly what shipped
  const shrunk = (prior, n) => ((prior * n) + (M * K)) / (n + K);

  const BUCKETS = [[1, 1], [2, 2], [1, 2], [3, 5], [6, 9], [10, 99]];
  const label = (lo, hi) => (lo === hi ? `n=${lo}` : hi === 99 ? `n>=${lo}` : `n=${lo}-${hi}`);
  const out = [];
  for (const [lo, hi] of BUCKETS) {
    const b = rows.filter((r) => r.n >= lo && r.n <= hi);
    if (!b.length) continue;
    const mae = (f) => b.reduce((a, r) => a + Math.abs(r.actual - f(r)), 0) / b.length;
    const per = mae((r) => r.prior);
    const lg = mae(() => leagueMean);
    const sh = mae((r) => shrunk(r.prior, r.n));
    const d = b.map((r) => Math.abs(r.actual - r.prior) - Math.abs(r.actual - shrunk(r.prior, r.n)));
    const md = d.reduce((a, v) => a + v, 0) / d.length;
    const sd = Math.sqrt(d.reduce((a, v) => a + (v - md) * (v - md), 0) / (d.length - 1));
    const t = md / (sd / Math.sqrt(d.length));
    out.push({
      bucket: label(lo, hi), fights: b.length,
      'personal MAE': +per.toFixed(1), 'league MAE': +lg.toFixed(1), 'SHRUNK MAE': +sh.toFixed(1),
      'shrunk beats personal by': +md.toFixed(2), t: +t.toFixed(2),
      verdict: sh <= per && sh <= lg ? 'BEST' : sh <= per ? 'beats personal only' : 'WORSE THAN PERSONAL',
    });
  }
  console.table(out);
  console.log('  Want: SHRUNK MAE <= both others at n=1-2, and no worse at high n.');
  console.log('  "WORSE THAN PERSONAL" at n>=6 would mean K is too large and should come down.');
  console.log('  NOTE: this validates the baseline INPUT, not the final lean, which also');
  console.log('  carries market anchoring and the opponent adjustment.');
  window.__fpShrink = { rows, out, leagueMean };
})();
