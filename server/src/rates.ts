import db from './db';

export interface RateBreak {
  max_weight: number;
  rate: number;
}

export type RatesByMethod = Map<number, RateBreak[]>;

// Load every method's rate card in one query, grouped by method, breaks ascending.
export function loadRatesByMethod(): RatesByMethod {
  const rows = db
    .prepare('SELECT method_id, max_weight, rate FROM shipping_rates ORDER BY method_id, max_weight ASC')
    .all() as { method_id: number; max_weight: number; rate: number }[];
  const map: RatesByMethod = new Map();
  for (const row of rows) {
    let breaks = map.get(row.method_id);
    if (!breaks) {
      breaks = [];
      map.set(row.method_id, breaks);
    }
    breaks.push({ max_weight: row.max_weight, rate: row.rate });
  }
  return map;
}

// First break that covers the billed weight ("up to X lbs").
// Returns null when the method has no rate card or the weight exceeds the largest break.
export function rateForWeight(
  breaks: RateBreak[] | undefined,
  billedWeight: number
): { rate: number; break_weight: number } | null {
  if (!breaks || breaks.length === 0) return null;
  for (const b of breaks) {
    if (billedWeight <= b.max_weight) return { rate: b.rate, break_weight: b.max_weight };
  }
  return null;
}
