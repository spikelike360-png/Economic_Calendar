import type { GEXStrike, GEXData } from './types';

// Standard normal PDF
function npdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Black-Scholes gamma: N'(d1) / (S × σ × √T)
function bsGamma(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  return npdf(d1) / (S * sigma * sqrtT);
}

// Strike where cumulative net GEX first crosses zero (moving away from spot)
function gammaFlip(strikes: GEXStrike[], spot: number): number | null {
  const sorted = [...strikes].sort((a, b) => a.strike - b.strike);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if ((a.netGEX >= 0) !== (b.netGEX >= 0)) {
      // Linear interpolation of zero crossing
      const total = Math.abs(a.netGEX) + Math.abs(b.netGEX);
      const frac  = total > 0 ? Math.abs(a.netGEX) / total : 0.5;
      return Math.round((a.strike + frac * (b.strike - a.strike)) * 100) / 100;
    }
  }
  return null;
}

export interface RawOpt {
  strike: number;
  openInterest: number;
  impliedVolatility: number;
  expiration: number; // Unix seconds
  volume?: number;    // fallback when OI = 0
}

const R    = 0.05;   // risk-free rate approx
const MULT = 100;    // shares per contract

export function buildGEX(
  calls: RawOpt[],
  puts: RawOpt[],
  spot: number,
  now = Date.now(),
): Omit<GEXData, 'symbol'> {
  const map = new Map<number, { callGEX: number; putGEX: number }>();

  // Minimum T = 1 day to prevent gamma explosion on 0DTE near expiry
  const T_MIN = 1 / 365.25;

  for (const opt of calls) {
    const rawT = (opt.expiration * 1000 - now) / (365.25 * 24 * 3600 * 1000);
    const T    = Math.max(rawT, T_MIN);
    if (rawT <= 0 || opt.impliedVolatility < 0.01 || opt.openInterest <= 0) continue;
    const g   = bsGamma(spot, opt.strike, T, R, opt.impliedVolatility);
    const gex = g * opt.openInterest * MULT * spot * spot;
    const e   = map.get(opt.strike) ?? { callGEX: 0, putGEX: 0 };
    e.callGEX += gex;
    map.set(opt.strike, e);
  }

  for (const opt of puts) {
    const rawT = (opt.expiration * 1000 - now) / (365.25 * 24 * 3600 * 1000);
    const T    = Math.max(rawT, T_MIN);
    if (rawT <= 0 || opt.impliedVolatility < 0.01 || opt.openInterest <= 0) continue;
    const g   = bsGamma(spot, opt.strike, T, R, opt.impliedVolatility);
    const gex = g * opt.openInterest * MULT * spot * spot;
    const e   = map.get(opt.strike) ?? { callGEX: 0, putGEX: 0 };
    e.putGEX -= gex; // puts reduce dealer gamma
    map.set(opt.strike, e);
  }

  const all: GEXStrike[] = Array.from(map.entries())
    .map(([strike, { callGEX, putGEX }]) => ({
      strike,
      callGEX,
      putGEX,
      netGEX: callGEX + putGEX,
    }))
    .sort((a, b) => a.strike - b.strike);

  // Restrict chart to ±10% of spot
  const band = spot * 0.10;
  const strikes = all.filter((s) => Math.abs(s.strike - spot) <= band);

  const netGEX = all.reduce((s, x) => s + x.netGEX, 0);

  const maxGEXStrike = all.reduce(
    (best, x) => (x.netGEX > best.netGEX ? x : best),
    all[0] ?? { strike: spot, netGEX: 0 },
  ).strike;

  return {
    spot,
    netGEX,
    maxGEXStrike,
    gammaFlip: gammaFlip(strikes, spot),
    strikes,
  };
}
