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

interface ResolvedItem {
  product: Product;
  quantity: number;
}

// ── Shared analysis helpers ───────────────────────────────────────────────────

function sortedDims(h: number, w: number, l: number): [number, number, number] {
  return [h, w, l].sort((a, b) => b - a) as [number, number, number];
}

// When foldable, halve the longest dimension and double the shortest (thickness stacks).
// Volume is conserved: 2t × w × (L/2) = t × w × L
function foldedProduct(p: Product): Product {
  if (!p.foldable) return p;
  const [longest, middle, shortest] = sortedDims(p.height, p.width, p.length);
  return { ...p, height: shortest * 2, width: middle, length: longest / 2 };
}

function productFitsInBox(product: Product, box: Packaging): boolean {
  const [pd1, pd2, pd3] = sortedDims(product.height, product.width, product.length);
  const [bd1, bd2, bd3] = sortedDims(box.height, box.width, box.length);
  return bd1 >= pd1 && bd2 >= pd2 && bd3 >= pd3;
}

function allItemsFitInBox(items: ResolvedItem[], box: Packaging, packEfficiency: number): boolean {
  if (!items.every(i => productFitsInBox(i.product, box))) return false;
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  if (totalQty === 1) return true;
  const totalVolume = items.reduce(
    (sum, i) => sum + i.product.height * i.product.width * i.product.length * i.quantity, 0
  );
  return totalVolume <= box.height * box.width * box.length * packEfficiency;
}

function fitQuality(pct: number): ConfiguratorResult['fit_quality'] {
  if (pct >= 90) return 'exact';
  if (pct >= 60) return 'good';
  if (pct >= 35) return 'loose';
  return 'large';
}

function analyzeShipment(
  items: ResolvedItem[],
  allPackaging: Packaging[],
  dimDivisor: number,
  packEfficiency: number
): ConfiguratorResult[] {
  const hasFoldedItems = items.some(i => i.product.foldable);
  // Apply fold transformations before all fit/volume calculations
  const effectiveItems = items.map(i => ({ ...i, product: foldedProduct(i.product) }));

  // Weight never changes when folding — use original items
  const totalActualWeight = items.reduce((sum, i) => sum + i.product.weight * i.quantity, 0);
  // Volume uses effective (folded) dims
  const totalProductVolume = effectiveItems.reduce(
    (sum, i) => sum + i.product.height * i.product.width * i.product.length * i.quantity, 0
  );
  const results: ConfiguratorResult[] = [];

  for (const pkg of allPackaging) {
    if (!allItemsFitInBox(effectiveItems, pkg, packEfficiency)) continue;
    const boxVolume = pkg.height * pkg.width * pkg.length;
    const dimWeight = boxVolume / dimDivisor;
    const pkgWeight = pkg.packaging_weight ?? 0;
    const totalWeight = totalActualWeight + pkgWeight;
    const volumeUtilization = (totalProductVolume / boxVolume) * 100;

    results.push({
      packaging: pkg,
      products_weight: Math.round(totalActualWeight * 1000) / 1000,
      packaging_weight: pkgWeight,
      total_weight: Math.round(totalWeight * 1000) / 1000,
      dim_weight: Math.round(dimWeight * 1000) / 1000,
      weight_flag: dimWeight > totalWeight,
      max_weight_flag: pkg.max_weight != null && totalWeight > pkg.max_weight,
      volume_utilization: Math.round(volumeUtilization * 10) / 10,
      fit_quality: fitQuality(volumeUtilization),
      products_fit: true,
      has_folded_items: hasFoldedItems,
    });
  }

  return results.sort((a, b) => b.volume_utilization - a.volume_utilization);
}

function mergeItems(items: RequestItem[], productMap: Map<string, Product>): ResolvedItem[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.product_id, (merged.get(item.product_id) ?? 0) + item.quantity);
  }
  return Array.from(merged.entries()).map(([id, qty]) => ({
    product: productMap.get(id)!,
    quantity: qty,
  }));
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Single configurator ───────────────────────────────────────────────────────

router.get('/template', (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Product ID', 'Quantity'],
    ['SKU-001', 1],
    ['SKU-002', 3],
    ['SKU-003', 2],
  ]);
  ws['!cols'] = [{ wch: 20 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Shipment');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="configurator-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.post('/import', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const sheet = XLSX.read(req.file.buffer, { type: 'buffer' }).Sheets;
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet[Object.keys(sheet)[0]]);
  if (rawRows.length === 0) return res.status(400).json({ error: 'Spreadsheet is empty' });

  const items: RequestItem[] = [];
  const errors: string[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawRows[i])) r[normalizeKey(k)] = v;
    const productId = String(r['productid'] ?? r['partnumber'] ?? r['id'] ?? r['sku'] ?? '').trim();
    const quantity = Math.round(Number(r['quantity'] ?? r['qty'] ?? 1));
    if (!productId) { errors.push(`Row ${i + 2}: missing Product ID — skipped`); continue; }
    if (isNaN(quantity) || quantity < 1) { errors.push(`Row ${i + 2}: invalid quantity — skipped`); continue; }
    items.push({ product_id: productId, quantity });
  }
  res.json({ items, errors });
});

router.post('/analyze', (req: Request, res: Response) => {
  const { items } = req.body as { items: RequestItem[] };
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'items must be a non-empty array' });

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const dimDivisor = Number(s.dim_divisor ?? 139);
  const packEfficiency = Number(s.pack_efficiency ?? 0.70);

  const uniqueIds = [...new Set(items.map(i => i.product_id))];
  const products = db
    .prepare(`SELECT * FROM products WHERE id IN (${uniqueIds.map(() => '?').join(',')})`)
    .all(...uniqueIds) as Product[];
  const productMap = new Map(products.map(p => [p.id, p]));
  const notFound = uniqueIds.filter(id => !productMap.has(id));
  if (notFound.length > 0) return res.status(404).json({ error: `Products not found: ${notFound.join(', ')}` });

  const resolvedItems = mergeItems(items, productMap);
  const allPackaging = db
    .prepare('SELECT * FROM packaging WHERE active = 1 ORDER BY height * width * length ASC')
    .all() as Packaging[];

  const results = analyzeShipment(resolvedItems, allPackaging, dimDivisor, packEfficiency);

  res.json({
    items: resolvedItems,
    total_actual_weight: Math.round(resolvedItems.reduce((s, i) => s + i.product.weight * i.quantity, 0) * 1000) / 1000,
    total_item_count: resolvedItems.reduce((s, i) => s + i.quantity, 0),
    settings: { dim_divisor: dimDivisor, pack_efficiency: packEfficiency },
    results,
  });
});

router.post('/export', (req: Request, res: Response) => {
  const { items, results, settings } = req.body as {
    items: { product: Product; quantity: number }[];
    results: ConfiguratorResult[];
    settings: { dim_divisor: number; pack_efficiency: number };
  };
  if (!Array.isArray(items) || !Array.isArray(results))
    return res.status(400).json({ error: 'Invalid payload' });

  const wb = XLSX.utils.book_new();
  const totalWeight = Math.round(items.reduce((s, i) => s + i.product.weight * i.quantity, 0) * 1000) / 1000;

  const rows = [
    // Products section
    ['PRODUCTS'],
    ['Part Number', 'Item Name', 'H (in)', 'W (in)', 'L (in)', 'Unit Wt (lbs)', 'Qty', 'Line Wt (lbs)'],
    ...items.map(({ product: p, quantity: qty }) => [
      p.id, p.name, p.height, p.width, p.length, p.weight, qty,
      Math.round(p.weight * qty * 1000) / 1000,
    ]),
    ['', '', '', '', '', '', 'Total:', totalWeight],
    [],
    // Packaging options section
    ['PACKAGING OPTIONS'],
    ['Rank', 'Packaging', 'Type', 'H (in)', 'W (in)', 'L (in)', 'Volume (in³)',
     'Utilization (%)', 'Fit Quality', 'Products Wt (lbs)', 'Shipping Weight (Pounds)',
     'Total Billed Wt (lbs)', `DIM Wt (lbs, ÷${settings?.dim_divisor ?? 139})`,
     'DIM Flag', 'Overweight Flag'],
    ...results.map((r, i) => [
      i + 1,
      r.packaging.name,
      r.packaging.type.replace(/_/g, ' '),
      r.packaging.height, r.packaging.width, r.packaging.length,
      Math.round(r.packaging.height * r.packaging.width * r.packaging.length * 10) / 10,
      r.volume_utilization,
      r.fit_quality.charAt(0).toUpperCase() + r.fit_quality.slice(1),
      r.products_weight,
      r.packaging_weight,
      r.total_weight,
      r.dim_weight,
      r.weight_flag ? 'YES' : 'No',
      r.max_weight_flag ? 'YES' : 'No',
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 14 }, { wch: 11 }, { wch: 17 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Results');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="configurator-results.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ── Bulk configurator ─────────────────────────────────────────────────────────

router.get('/bulk-template', (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Order ID', 'Part Number', 'Quantity'],
    ['ORD-001', 'SKU-001', 2],
    ['ORD-001', 'SKU-002', 1],
    ['ORD-002', 'SKU-003', 3],
    ['ORD-003', 'SKU-001', 1],
  ]);
  ws['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Shipments');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="bulk-configurator-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.post('/bulk', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  if (rawRows.length === 0) return res.status(400).json({ error: 'Spreadsheet is empty' });

  // Parse and group by Order ID
  const orderMap = new Map<string, RequestItem[]>();
  const parseErrors: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawRows[i])) r[normalizeKey(k)] = v;

    const orderId = String(r['orderid'] ?? r['shipmentid'] ?? r['order'] ?? '').trim();
    const productId = String(r['partnumber'] ?? r['productid'] ?? r['id'] ?? r['sku'] ?? '').trim();
    const quantity = Math.round(Number(r['quantity'] ?? r['qty'] ?? 1));

    if (!orderId) { parseErrors.push(`Row ${i + 2}: missing Order ID — skipped`); continue; }
    if (!productId) { parseErrors.push(`Row ${i + 2}: missing Part Number — skipped`); continue; }
    if (isNaN(quantity) || quantity < 1) { parseErrors.push(`Row ${i + 2}: invalid quantity — skipped`); continue; }

    if (!orderMap.has(orderId)) orderMap.set(orderId, []);
    orderMap.get(orderId)!.push({ product_id: productId, quantity });
  }

  if (orderMap.size === 0) return res.status(400).json({ error: 'No valid shipment rows found', parseErrors });

  // Load all unique products in one query
  const allProductIds = [...new Set([...orderMap.values()].flat().map(i => i.product_id))];
  const products = db
    .prepare(`SELECT * FROM products WHERE id IN (${allProductIds.map(() => '?').join(',')})`)
    .all(...allProductIds) as Product[];
  const productMap = new Map(products.map(p => [p.id, p]));

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const dimDivisor = Number(s.dim_divisor ?? 139);
  const packEfficiency = Number(s.pack_efficiency ?? 0.70);

  const allPackaging = db
    .prepare('SELECT * FROM packaging WHERE active = 1 ORDER BY height * width * length ASC')
    .all() as Packaging[];

  // Analyze each shipment
  const shipments = [];
  let matched = 0, flagged = 0, errors = 0;

  for (const [orderId, items] of orderMap.entries()) {
    const missingIds = [...new Set(items.map(i => i.product_id))].filter(id => !productMap.has(id));
    if (missingIds.length > 0) {
      shipments.push({ id: orderId, items: [], total_item_count: 0, total_actual_weight: 0, results: [], best: null, error: `Products not found: ${missingIds.join(', ')}` });
      errors++;
      continue;
    }

    const resolvedItems = mergeItems(items, productMap);
    const totalActualWeight = resolvedItems.reduce((sum, i) => sum + i.product.weight * i.quantity, 0);
    const results = analyzeShipment(resolvedItems, allPackaging, dimDivisor, packEfficiency);
    const best = results[0] ?? null;

    if (best) {
      matched++;
      if (best.weight_flag || best.max_weight_flag) flagged++;
    } else {
      errors++;
    }

    shipments.push({
      id: orderId,
      items: resolvedItems,
      total_item_count: resolvedItems.reduce((sum, i) => sum + i.quantity, 0),
      total_actual_weight: Math.round(totalActualWeight * 1000) / 1000,
      results,
      best,
      error: null,
    });
  }

  res.json({
    shipments,
    parse_errors: parseErrors,
    settings: { dim_divisor: dimDivisor, pack_efficiency: packEfficiency },
    summary: { total: orderMap.size, matched, flagged, errors },
  });
});

router.post('/bulk-export', (req: Request, res: Response) => {
  const { shipments } = req.body as { shipments: ReturnType<typeof buildShipmentRow>[] };
  if (!Array.isArray(shipments)) return res.status(400).json({ error: 'Invalid payload' });

  const headers = [
    'Order ID', 'Items', 'Total Units', 'Products Weight (lbs)',
    'Shipping Weight (Pounds)', 'Total Billed Weight (lbs)',
    'Recommended Packaging', 'Shipping Height (Inches)', 'Shipping Length (Inches)', 'Shipping Width (Inches)',
    'Fit Quality', 'Volume Utilization (%)',
    'Dim Weight (lbs)', 'Dim Weight Flag', 'Overweight Flag', 'Error',
  ];

  const dataRows = shipments.map((s: any) => {
    const best = s.best;
    const itemsSummary = (s.items ?? [])
      .map((i: any) => `${i.product.id} ×${i.quantity}`)
      .join(', ');
    return [
      s.id,
      itemsSummary,
      s.total_item_count ?? '',
      best ? best.products_weight : '',
      best ? best.packaging_weight : '',
      best ? best.total_weight : '',
      best ? best.packaging.name : '',
      best ? best.packaging.height : '',
      best ? best.packaging.length : '',
      best ? best.packaging.width : '',
      best ? best.fit_quality : '',
      best ? best.volume_utilization : '',
      best ? best.dim_weight : '',
      best ? (best.weight_flag ? 'YES' : 'No') : '',
      best ? (best.max_weight_flag ? 'YES' : 'No') : '',
      s.error ?? '',
    ];
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 14 : i === 1 ? 30 : h.length + 4 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename="bulk-results.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Type helper (not actually called, just for TS)
function buildShipmentRow(_: unknown) { return _; }

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

router.put('/settings', (req: Request, res: Response) => {
  const { dim_divisor, pack_efficiency, weight_unit, dim_unit } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction(() => {
    if (dim_divisor != null) upsert.run('dim_divisor', String(Number(dim_divisor)));
    if (pack_efficiency != null) upsert.run('pack_efficiency', String(Number(pack_efficiency)));
    if (weight_unit) upsert.run('weight_unit', weight_unit);
    if (dim_unit) upsert.run('dim_unit', dim_unit);
  })();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

export default router;
