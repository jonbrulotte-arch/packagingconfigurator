import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db';
import { Product, Packaging, ConfiguratorResult } from '../types';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

interface RequestItem {
  product_id: string;
  quantity: number;
}

function sortedDims(h: number, w: number, l: number): [number, number, number] {
  return [h, w, l].sort((a, b) => b - a) as [number, number, number];
}

function productFitsInBox(product: Product, box: Packaging): boolean {
  const [pd1, pd2, pd3] = sortedDims(product.height, product.width, product.length);
  const [bd1, bd2, bd3] = sortedDims(box.height, box.width, box.length);
  return bd1 >= pd1 && bd2 >= pd2 && bd3 >= pd3;
}

function allItemsFitInBox(
  items: { product: Product; quantity: number }[],
  box: Packaging,
  packEfficiency: number
): boolean {
  // Every unique product must individually fit inside the box
  if (!items.every(i => productFitsInBox(i.product, box))) return false;

  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

  // Single unit: dimension check alone is sufficient
  if (totalQty === 1) return true;

  // Multiple units/products: use volume heuristic
  const totalVolume = items.reduce(
    (sum, i) => sum + i.product.height * i.product.width * i.product.length * i.quantity,
    0
  );
  const boxVolume = box.height * box.width * box.length;
  return totalVolume <= boxVolume * packEfficiency;
}

function fitQuality(utilizationPct: number): ConfiguratorResult['fit_quality'] {
  if (utilizationPct >= 90) return 'exact';
  if (utilizationPct >= 60) return 'good';
  if (utilizationPct >= 35) return 'snug';
  return 'large';
}

router.get('/template', (_req: Request, res: Response) => {
  const wb = XLSX.utils.book_new();
  const rows = [
    ['Product ID', 'Quantity'],
    ['SKU-001', 1],
    ['SKU-002', 3],
    ['SKU-003', 2],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [{ wch: 20 }, { wch: 10 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Shipment');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename="configurator-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.post('/import', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  if (rawRows.length === 0) return res.status(400).json({ error: 'Spreadsheet is empty' });

  const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

  const items: RequestItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawRows[i])) normalized[normalize(k)] = v;

    const productId = String(normalized['productid'] ?? normalized['id'] ?? normalized['sku'] ?? '').trim();
    const rawQty = normalized['quantity'] ?? normalized['qty'] ?? normalized['amount'] ?? 1;
    const quantity = Math.round(Number(rawQty));

    if (!productId) {
      errors.push(`Row ${i + 2}: missing Product ID — skipped`);
      continue;
    }
    if (isNaN(quantity) || quantity < 1) {
      errors.push(`Row ${i + 2}: invalid quantity "${rawQty}" for "${productId}" — skipped`);
      continue;
    }

    items.push({ product_id: productId, quantity });
  }

  res.json({ items, errors });
});

router.post('/analyze', (req: Request, res: Response) => {
  const { items } = req.body as { items: RequestItem[] };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }

  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity < 1) {
      return res.status(400).json({ error: 'Each item needs a product_id and a quantity ≥ 1' });
    }
  }

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const dimDivisor = Number(settings.dim_divisor ?? 139);
  const packEfficiency = Number(settings.pack_efficiency ?? 0.70);

  const uniqueIds = [...new Set(items.map(i => i.product_id))];
  const placeholders = uniqueIds.map(() => '?').join(',');
  const products = db
    .prepare(`SELECT * FROM products WHERE id IN (${placeholders})`)
    .all(...uniqueIds) as Product[];

  const productMap = new Map(products.map(p => [p.id, p]));
  const notFound = uniqueIds.filter(id => !productMap.has(id));
  if (notFound.length > 0) {
    return res.status(404).json({ error: `Products not found: ${notFound.join(', ')}` });
  }

  // Merge duplicate product IDs by summing their quantities
  const mergedMap = new Map<string, number>();
  for (const item of items) {
    mergedMap.set(item.product_id, (mergedMap.get(item.product_id) ?? 0) + item.quantity);
  }
  const resolvedItems = Array.from(mergedMap.entries()).map(([id, qty]) => ({
    product: productMap.get(id)!,
    quantity: qty,
  }));

  const totalActualWeight = resolvedItems.reduce(
    (sum, i) => sum + i.product.weight * i.quantity,
    0
  );
  const totalItemCount = resolvedItems.reduce((sum, i) => sum + i.quantity, 0);

  const allPackaging = db
    .prepare('SELECT * FROM packaging WHERE active = 1 ORDER BY height * width * length ASC')
    .all() as Packaging[];

  const results: ConfiguratorResult[] = [];

  for (const pkg of allPackaging) {
    if (!allItemsFitInBox(resolvedItems, pkg, packEfficiency)) continue;

    const boxVolume = pkg.height * pkg.width * pkg.length;
    const dimWeight = boxVolume / dimDivisor;
    const pkgWeight = pkg.packaging_weight ?? 0;
    const totalWeight = totalActualWeight + pkgWeight;
    const totalProductVolume = resolvedItems.reduce(
      (sum, i) => sum + i.product.height * i.product.width * i.product.length * i.quantity,
      0
    );
    const volumeUtilization = (totalProductVolume / boxVolume) * 100;
    const weightFlag = dimWeight > totalWeight;
    const maxWeightFlag = pkg.max_weight != null && totalWeight > pkg.max_weight;

    results.push({
      packaging: pkg,
      products_weight: totalActualWeight,
      packaging_weight: pkgWeight,
      total_weight: Math.round(totalWeight * 1000) / 1000,
      dim_weight: dimWeight,
      weight_flag: weightFlag,
      max_weight_flag: maxWeightFlag,
      volume_utilization: Math.round(volumeUtilization * 10) / 10,
      fit_quality: fitQuality(volumeUtilization),
      products_fit: true,
    });
  }

  results.sort((a, b) => b.volume_utilization - a.volume_utilization);

  res.json({
    items: resolvedItems,
    total_actual_weight: Math.round(totalActualWeight * 1000) / 1000,
    total_item_count: totalItemCount,
    settings: { dim_divisor: dimDivisor, pack_efficiency: packEfficiency },
    results,
  });
});

router.get('/settings', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
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
