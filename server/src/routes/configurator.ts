import { Router, Request, Response } from 'express';
import db from '../db';
import { Product, Packaging, ConfiguratorResult } from '../types';

const router = Router();

function sortedDims(h: number, w: number, l: number): [number, number, number] {
  return [h, w, l].sort((a, b) => b - a) as [number, number, number];
}

function productFitsInBox(product: Product, box: Packaging): boolean {
  const [pd1, pd2, pd3] = sortedDims(product.height, product.width, product.length);
  const [bd1, bd2, bd3] = sortedDims(box.height, box.width, box.length);
  return bd1 >= pd1 && bd2 >= pd2 && bd3 >= pd3;
}

function allProductsFitInBox(products: Product[], box: Packaging, packEfficiency: number): boolean {
  // Every individual product must be able to fit in the box
  if (!products.every(p => productFitsInBox(p, box))) return false;

  if (products.length === 1) return true;

  // For multiple products: total volume must fit within box * packing efficiency
  const totalProductVolume = products.reduce((sum, p) => sum + p.height * p.width * p.length, 0);
  const boxVolume = box.height * box.width * box.length;
  return totalProductVolume <= boxVolume * packEfficiency;
}

function fitQuality(utilizationPct: number): ConfiguratorResult['fit_quality'] {
  if (utilizationPct >= 90) return 'exact';
  if (utilizationPct >= 60) return 'good';
  if (utilizationPct >= 35) return 'snug';
  return 'large';
}

router.post('/analyze', (req: Request, res: Response) => {
  const { product_ids } = req.body as { product_ids: string[] };

  if (!Array.isArray(product_ids) || product_ids.length === 0) {
    return res.status(400).json({ error: 'product_ids must be a non-empty array' });
  }

  const getSettings = db.prepare('SELECT key, value FROM settings');
  const settingsRows = getSettings.all() as { key: string; value: string }[];
  const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const dimDivisor = Number(settings.dim_divisor ?? 139);
  const packEfficiency = Number(settings.pack_efficiency ?? 0.70);

  const placeholders = product_ids.map(() => '?').join(',');
  const products = db
    .prepare(`SELECT * FROM products WHERE id IN (${placeholders})`)
    .all(...product_ids) as Product[];

  const foundIds = new Set(products.map(p => p.id));
  const notFound = product_ids.filter(id => !foundIds.has(id));

  if (notFound.length > 0) {
    return res.status(404).json({ error: `Products not found: ${notFound.join(', ')}` });
  }

  const allPackaging = db
    .prepare('SELECT * FROM packaging WHERE active = 1 ORDER BY height * width * length ASC')
    .all() as Packaging[];

  const totalActualWeight = products.reduce((sum, p) => sum + p.weight, 0);

  const results: ConfiguratorResult[] = [];

  for (const pkg of allPackaging) {
    if (!allProductsFitInBox(products, pkg, packEfficiency)) continue;

    const boxVolume = pkg.height * pkg.width * pkg.length;
    const dimWeight = boxVolume / dimDivisor;
    const totalProductVolume = products.reduce((sum, p) => sum + p.height * p.width * p.length, 0);
    const volumeUtilization = (totalProductVolume / boxVolume) * 100;

    const weightFlag = dimWeight > totalActualWeight;
    const maxWeightFlag = pkg.max_weight != null && totalActualWeight > pkg.max_weight;

    results.push({
      packaging: pkg,
      actual_weight: totalActualWeight,
      dim_weight: dimWeight,
      weight_flag: weightFlag,
      max_weight_flag: maxWeightFlag,
      volume_utilization: Math.round(volumeUtilization * 10) / 10,
      fit_quality: fitQuality(volumeUtilization),
      products_fit: true,
    });
  }

  // Sort by volume utilization descending (best fit first = least waste)
  results.sort((a, b) => b.volume_utilization - a.volume_utilization);

  res.json({
    products,
    total_actual_weight: Math.round(totalActualWeight * 100) / 100,
    settings: { dim_divisor: dimDivisor, pack_efficiency: packEfficiency },
    results,
  });
});

router.get('/settings', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

router.put('/settings', (req: Request, res: Response) => {
  const { dim_divisor, pack_efficiency, weight_unit, dim_unit } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const update = db.transaction(() => {
    if (dim_divisor != null) upsert.run('dim_divisor', String(Number(dim_divisor)));
    if (pack_efficiency != null) upsert.run('pack_efficiency', String(Number(pack_efficiency)));
    if (weight_unit) upsert.run('weight_unit', weight_unit);
    if (dim_unit) upsert.run('dim_unit', dim_unit);
  });
  update();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

export default router;
