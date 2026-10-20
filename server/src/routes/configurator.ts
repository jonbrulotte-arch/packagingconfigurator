import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db';
import { Product, Packaging, ConfiguratorResult, ShippingMethod, ShippingMatch, StandaloneResult } from '../types';
import { loadRatesByMethod, rateForWeight, RatesByMethod } from '../rates';
import { requireEdit } from './auth';

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

// For packaging with max_height set, substitute max_height for the H dimension so the
// thickness constraint is applied during fit checks and volume calculations.
function effectiveBoxDims(box: Packaging): [number, number, number] {
  const h = box.max_height != null ? box.max_height : box.height;
  return sortedDims(h, box.width, box.length);
}

function isFlexibleMailer(box: Packaging): boolean {
  return (box.type === 'bubble_mailer' || box.type === 'poly_mailer') && box.max_height != null;
}

function productFitsInBox(product: Product, box: Packaging, clearance = 0): boolean {
  const [pd1, pd2, pd3] = sortedDims(product.height, product.width, product.length);
  if (isFlexibleMailer(box)) {
    const flatD1 = Math.max(box.width, box.length);
    const flatD2 = Math.min(box.width, box.length);
    return box.max_height! >= pd3 + clearance &&
      flatD1 >= pd1 + clearance &&
      flatD2 >= pd2 + clearance;
  }
  const [bd1, bd2, bd3] = effectiveBoxDims(box);
  return bd1 >= pd1 + clearance && bd2 >= pd2 + clearance && bd3 >= pd3 + clearance;
}

function allItemsFitInBox(items: ResolvedItem[], box: Packaging, packEfficiency: number, clearance = 0): boolean {
  if (!items.every(i => productFitsInBox(i.product, box, clearance))) return false;
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  if (totalQty === 1) return true;

  // For packaging with max_height: check total stacked thickness instead of volume heuristic.
  // Items lay flat; thickness = each item's smallest dimension, and layers stack.
  if (box.max_height != null) {
    const totalThickness = items.reduce((sum, i) => {
      const [, , thickness] = sortedDims(i.product.height, i.product.width, i.product.length);
      return sum + thickness * i.quantity;
    }, 0);
    if (totalThickness + clearance > box.max_height) return false;
    if (isFlexibleMailer(box)) {
      const flatD1 = Math.max(box.width, box.length);
      const flatD2 = Math.min(box.width, box.length);
      return items.every(item => {
        const [pd1, pd2] = sortedDims(item.product.height, item.product.width, item.product.length);
        return pd1 + clearance <= flatD1 && pd2 + clearance <= flatD2;
      });
    }
    return true;
  }

  const totalVolume = items.reduce(
    (sum, i) => sum + i.product.height * i.product.width * i.product.length * i.quantity, 0
  );
  const [bd1, bd2, bd3] = effectiveBoxDims(box);
  return totalVolume <= bd1 * bd2 * bd3 * packEfficiency;
}

function fitQuality(pct: number): ConfiguratorResult['fit_quality'] {
  if (pct >= 90) return 'exact';
  if (pct >= 60) return 'good';
  if (pct >= 35) return 'loose';
  return 'large';
}

function loadActiveShippingMethods(): ShippingMethod[] {
  return db.prepare('SELECT * FROM shipping_methods WHERE active = 1 ORDER BY sort_order, min_weight, id').all() as ShippingMethod[];
}

// Carriers bill in whole pounds for packages ≥ 1 lb; below 1 lb keep the decimal.
function roundWeight(w: number): number {
  if (w >= 1) return Math.ceil(w);
  return Math.round(w * 1000) / 1000;
}

// LTL freight: no DIM billing, match methods by actual weight only
function computeLtlShipping(
  actualWeight: number,
  methods: ShippingMethod[],
  rates: RatesByMethod = new Map()
): ShippingMatch[] {
  const billed = roundWeight(actualWeight);
  return methods
    .filter(m => billed >= m.min_weight && (m.max_weight == null || billed <= m.max_weight))
    .map(m => {
      const r = rateForWeight(rates.get(m.id), billed);
      return {
        method_id: m.id,
        method_name: m.name,
        billed_weight: billed,
        dim_applied: false,
        rate: r?.rate ?? null,
        rate_break: r?.break_weight ?? null,
      };
    });
}

function computeShipping(
  dimVolume: number,
  actualWeight: number,
  globalDimDivisor: number,
  methods: ShippingMethod[],
  rates: RatesByMethod = new Map()
): ShippingMatch[] {
  const matches: ShippingMatch[] = [];
  for (const m of methods) {
    const effectiveDivisor = m.dim_divisor ?? globalDimDivisor;
    const carrierDimWeight = roundWeight(dimVolume / effectiveDivisor);
    // DIM only applies if no threshold is set OR the package volume exceeds the threshold
    const dimApplies = m.dim_threshold == null || dimVolume > m.dim_threshold;
    const carrierBilled = dimApplies
      ? roundWeight(Math.max(actualWeight, carrierDimWeight))
      : roundWeight(actualWeight);
    // Only include this method if the billed weight falls within its weight range
    const withinMin = carrierBilled >= m.min_weight;
    const withinMax = m.max_weight == null || carrierBilled <= m.max_weight;
    if (withinMin && withinMax) {
      const r = rateForWeight(rates.get(m.id), carrierBilled);
      matches.push({
        method_id: m.id,
        method_name: m.name,
        billed_weight: carrierBilled,
        dim_applied: dimApplies && carrierDimWeight > actualWeight,
        rate: r?.rate ?? null,
        rate_break: r?.break_weight ?? null,
      });
    }
  }
  return matches;
}

function computeStandaloneResult(
  product: Product,
  quantity: number,
  dimDivisor: number,
  shippingMethods: ShippingMethod[],
  rates: RatesByMethod = new Map()
): StandaloneResult {
  const productVolume = product.height * product.width * product.length;
  const unitDimWeight = roundWeight(productVolume / dimDivisor);
  const unitActualWeight = product.weight;
  const unitBilledWeight = roundWeight(Math.max(unitActualWeight, unitDimWeight));
  return {
    product,
    quantity,
    products_weight: Math.round(unitActualWeight * quantity * 1000) / 1000,
    unit_dim_weight: unitDimWeight,
    unit_billed_weight: unitBilledWeight,
    total_billed_weight: unitBilledWeight * quantity,
    weight_flag: unitDimWeight > unitActualWeight,
    shipping: computeShipping(productVolume, unitActualWeight, dimDivisor, shippingMethods, rates),
  };
}

function analyzeShipment(
  items: ResolvedItem[],
  allPackaging: Packaging[],
  dimDivisor: number,
  packEfficiency: number,
  fitClearance: number,
  shippingMethods: ShippingMethod[] = [],
  rates: RatesByMethod = new Map()
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
    if (!allItemsFitInBox(effectiveItems, pkg, packEfficiency, fitClearance)) continue;
    const [ed1, ed2, ed3] = effectiveBoxDims(pkg);
    const boxVolume = ed1 * ed2 * ed3;

    // For packaging with max_height, DIM uses actual stacked product thickness, not max capacity.
    // Carriers measure the sealed package — thickness equals the product's smallest dimension.
    // For bubble/poly mailers, the mailer material (pkg.height) adds to sealed thickness, and
    // the flat dimensions shrink by the product thickness (envelope wraps around the contents).
    let dimVolume = boxVolume;
    let shippedDims = { height: pkg.height, width: pkg.width, length: pkg.length };
    if (pkg.max_height != null) {
      const productThickness = effectiveItems.reduce((sum, i) => {
        const [, , t] = sortedDims(i.product.height, i.product.width, i.product.length);
        return sum + t * i.quantity;
      }, 0);
      const mailerMaterial = (pkg.type === 'bubble_mailer' || pkg.type === 'poly_mailer') ? pkg.height : 0;
      const packedThickness = productThickness + mailerMaterial;
      if (isFlexibleMailer(pkg)) {
        const flatD1 = Math.max(pkg.width, pkg.length);
        const flatD2 = Math.min(pkg.width, pkg.length);
        dimVolume = (flatD1 - productThickness) * (flatD2 - productThickness) * packedThickness;
        shippedDims = {
          height: Math.round(packedThickness * 1000) / 1000,
          width: Math.round((flatD2 - productThickness) * 1000) / 1000,
          length: Math.round((flatD1 - productThickness) * 1000) / 1000,
        };
      } else {
        dimVolume = ed1 * ed2 * packedThickness;
        shippedDims = { height: Math.round(packedThickness * 1000) / 1000, width: pkg.width, length: pkg.length };
      }
    }

    const dimWeight = roundWeight(dimVolume / dimDivisor);
    const pkgWeight = pkg.packaging_weight ?? 0;
    const actualWeight = totalActualWeight + pkgWeight;
    const billedWeight = roundWeight(Math.max(actualWeight, dimWeight));
    const packedVolume = (pkg.max_height != null) ? dimVolume : boxVolume;
    const volumeUtilization = (totalProductVolume / packedVolume) * 100;
    const shipping = computeShipping(dimVolume, actualWeight, dimDivisor, shippingMethods, rates);
    // Flag only when there is no DIM-free carrier option available.
    // If at least one method bills by actual weight, the user can avoid DIM charges.
    const weight_flag = shipping.length > 0
      ? shipping.every(sm => sm.dim_applied)
      : dimWeight > actualWeight;

    results.push({
      packaging: pkg,
      products_weight: Math.round(totalActualWeight * 1000) / 1000,
      packaging_weight: pkgWeight,
      total_weight: billedWeight,
      dim_weight: dimWeight,
      weight_flag,
      max_weight_flag: pkg.max_weight != null && actualWeight > pkg.max_weight,
      volume_utilization: Math.round(volumeUtilization * 10) / 10,
      fit_quality: fitQuality(volumeUtilization),
      products_fit: true,
      has_folded_items: hasFoldedItems,
      shipping,
      shipped_dims: shippedDims,
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
  const { items, best_only } = req.body as { items: RequestItem[]; best_only?: boolean };
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'items must be a non-empty array' });
  const bestOnly = best_only !== false;

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const dimDivisor = Number(s.dim_divisor ?? 139);
  const packEfficiency = Number(s.pack_efficiency ?? 0.70);
  const ltlThreshold = Number(s.ltl_threshold ?? 150);
  const fitClearance = Number(s.fit_clearance ?? 0.5);

  const uniqueIds = [...new Set(items.map(i => i.product_id))];
  const products = db
    .prepare(`SELECT * FROM products WHERE id IN (${uniqueIds.map(() => '?').join(',')}) OR upc IN (${uniqueIds.map(() => '?').join(',')})`)
    .all(...uniqueIds, ...uniqueIds) as Product[];
  // Build lookup map that resolves both product ID and UPC to the same product record
  const productMap = new Map<string, Product>();
  for (const p of products) {
    productMap.set(p.id, p);
    if (p.upc) productMap.set(p.upc, p);
  }
  const notFound = uniqueIds.filter(id => !productMap.has(id));
  if (notFound.length > 0) return res.status(404).json({ error: `Products not found: ${notFound.join(', ')}` });

  const allItems = mergeItems(items, productMap);
  const standaloneItems = allItems.filter(i => i.product.ships_in_own_packaging);
  const packagedItems = allItems.filter(i => !i.product.ships_in_own_packaging);

  const totalActualWeight = Math.round(allItems.reduce((sum, i) => sum + i.product.weight * i.quantity, 0) * 1000) / 1000;
  const allPackaging = db
    .prepare('SELECT * FROM packaging WHERE active = 1 ORDER BY height * width * length ASC')
    .all() as Packaging[];
  const shippingMethods = loadActiveShippingMethods();
  const rates = loadRatesByMethod();
  const parcelMethods = shippingMethods.filter(m => !m.is_ltl);
  const results = packagedItems.length > 0
    ? analyzeShipment(packagedItems, allPackaging, dimDivisor, packEfficiency, fitClearance, parcelMethods, rates)
    : [];
  const standaloneResults = standaloneItems.map(si =>
    computeStandaloneResult(si.product, si.quantity, dimDivisor, parcelMethods, rates)
  );

  const ltlRequired = totalActualWeight >= ltlThreshold;
  const ltlShipping = ltlRequired ? computeLtlShipping(totalActualWeight, shippingMethods, rates) : [];

  res.json({
    items: allItems,
    total_actual_weight: totalActualWeight,
    total_item_count: allItems.reduce((s, i) => s + i.quantity, 0),
    settings: { dim_divisor: dimDivisor, pack_efficiency: packEfficiency, ltl_threshold: ltlThreshold },
    results: bestOnly ? results.slice(0, 1) : results,
    standalone_items: standaloneResults,
    ltl_required: ltlRequired,
    ltl_shipping: ltlShipping,
  });
});

router.post('/analyze-manual', (req: Request, res: Response) => {
  interface ManualItem {
    name?: string;
    height: number;
    width: number;
    length: number;
    weight: number;
    quantity: number;
    foldable?: number;
    ships_in_own_packaging?: number;
  }
  const { items } = req.body as { items: ManualItem[] };
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'items must be a non-empty array' });

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const dimDivisor = Number(s.dim_divisor ?? 139);
  const packEfficiency = Number(s.pack_efficiency ?? 0.70);
  const ltlThreshold = Number(s.ltl_threshold ?? 150);
  const fitClearance = Number(s.fit_clearance ?? 0.5);

  const resolvedItems: ResolvedItem[] = items.map((item, idx) => ({
    product: {
      id: `manual-${idx + 1}`,
      name: item.name?.trim() || `Item ${idx + 1}`,
      height: Number(item.height),
      width: Number(item.width),
      length: Number(item.length),
      weight: Number(item.weight),
      foldable: item.foldable ? 1 : 0,
      ships_in_own_packaging: item.ships_in_own_packaging ? 1 : 0,
    },
    quantity: Math.max(1, Math.round(Number(item.quantity))),
  }));

  const standaloneItems = resolvedItems.filter(i => i.product.ships_in_own_packaging);
  const packagedItems = resolvedItems.filter(i => !i.product.ships_in_own_packaging);
  const totalActualWeight = Math.round(resolvedItems.reduce((sum, i) => sum + i.product.weight * i.quantity, 0) * 1000) / 1000;

  const allPackaging = db
    .prepare('SELECT * FROM packaging WHERE active = 1 ORDER BY height * width * length ASC')
    .all() as Packaging[];
  const shippingMethods = loadActiveShippingMethods();
  const rates = loadRatesByMethod();
  const parcelMethods = shippingMethods.filter(m => !m.is_ltl);
  const results = packagedItems.length > 0
    ? analyzeShipment(packagedItems, allPackaging, dimDivisor, packEfficiency, fitClearance, parcelMethods, rates)
    : [];
  const standaloneResults = standaloneItems.map(si =>
    computeStandaloneResult(si.product, si.quantity, dimDivisor, parcelMethods, rates)
  );

  const ltlRequired = totalActualWeight >= ltlThreshold;
  const ltlShipping = ltlRequired ? computeLtlShipping(totalActualWeight, shippingMethods, rates) : [];

  res.json({
    items: resolvedItems,
    total_actual_weight: totalActualWeight,
    total_item_count: resolvedItems.reduce((s, i) => s + i.quantity, 0),
    settings: { dim_divisor: dimDivisor, pack_efficiency: packEfficiency, ltl_threshold: ltlThreshold },
    results,
    standalone_items: standaloneResults,
    ltl_required: ltlRequired,
    ltl_shipping: ltlShipping,
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
     'Utilization (%)', 'Fit Quality', 'Products Wt (lbs)', 'Packaging Wt (lbs)', 'Actual Shipping Wt (lbs)',
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
      Math.round((r.products_weight + r.packaging_weight) * 1000) / 1000,
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
    ['Grouping ID', 'Part Number', 'Quantity'],
    ['GRP-001', 'SKU-001', 2],
    ['GRP-001', 'SKU-002', 1],
    ['GRP-002', 'SKU-003', 3],
    ['GRP-003', 'SKU-001', 1],
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

    const orderId = String(r['groupingid'] ?? r['orderid'] ?? r['shipmentid'] ?? r['order'] ?? r['groupid'] ?? '').trim();
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
  const ltlThreshold = Number(s.ltl_threshold ?? 150);
  const fitClearance = Number(s.fit_clearance ?? 0.5);

  const allPackaging = db
    .prepare('SELECT * FROM packaging WHERE active = 1 ORDER BY height * width * length ASC')
    .all() as Packaging[];
  const shippingMethods = loadActiveShippingMethods();
  const rates = loadRatesByMethod();
  const parcelMethods = shippingMethods.filter(m => !m.is_ltl);

  // Analyze each shipment
  const shipments = [];
  let matched = 0, flagged = 0, ltl = 0, errors = 0;

  for (const [orderId, items] of orderMap.entries()) {
    const missingIds = [...new Set(items.map(i => i.product_id))].filter(id => !productMap.has(id));
    if (missingIds.length > 0) {
      shipments.push({ id: orderId, items: [], total_item_count: 0, total_actual_weight: 0, results: [], standalone_items: [], best: null, ltl_required: false, ltl_shipping: [], error: `Products not found: ${missingIds.join(', ')}` });
      errors++;
      continue;
    }

    const allResolvedItems = mergeItems(items, productMap);
    const standaloneItems = allResolvedItems.filter(i => i.product.ships_in_own_packaging);
    const packagedItems = allResolvedItems.filter(i => !i.product.ships_in_own_packaging);

    const totalActualWeight = allResolvedItems.reduce((sum, i) => sum + i.product.weight * i.quantity, 0);
    const ltlRequired = totalActualWeight >= ltlThreshold;
    const ltlShipping = ltlRequired ? computeLtlShipping(totalActualWeight, shippingMethods, rates) : [];
    const results = packagedItems.length > 0
      ? analyzeShipment(packagedItems, allPackaging, dimDivisor, packEfficiency, fitClearance, parcelMethods, rates)
      : [];
    const standaloneResults = standaloneItems.map(si =>
      computeStandaloneResult(si.product, si.quantity, dimDivisor, parcelMethods, rates)
    );
    const best = results[0] ?? null;
    const allItemsAreStandalone = packagedItems.length === 0 && standaloneItems.length > 0;

    if (ltlRequired) {
      ltl++;
    } else if (allItemsAreStandalone || best) {
      matched++;
      if (best && (best.weight_flag || best.max_weight_flag || best.fit_quality === 'loose' || best.fit_quality === 'large')) flagged++;
    } else {
      errors++;
    }

    shipments.push({
      id: orderId,
      items: allResolvedItems,
      total_item_count: allResolvedItems.reduce((sum, i) => sum + i.quantity, 0),
      total_actual_weight: Math.round(totalActualWeight * 1000) / 1000,
      results,
      standalone_items: standaloneResults,
      best,
      ltl_required: ltlRequired,
      ltl_shipping: ltlShipping,
      error: null,
    });
  }

  res.json({
    shipments,
    parse_errors: parseErrors,
    settings: { dim_divisor: dimDivisor, pack_efficiency: packEfficiency, ltl_threshold: ltlThreshold },
    summary: { total: orderMap.size, matched, flagged, ltl, errors },
  });
});

router.post('/bulk-export', (req: Request, res: Response) => {
  const { shipments } = req.body as { shipments: ReturnType<typeof buildShipmentRow>[] };
  if (!Array.isArray(shipments)) return res.status(400).json({ error: 'Invalid payload' });

  const headers = [
    'Grouping ID', 'Items', 'Total Units', 'Products Weight (lbs)',
    'Packaging Weight (lbs)', 'Actual Shipping Weight (lbs)', 'Total Billed Weight (lbs)',
    'Recommended Packaging', 'Shipping Height (Inches)', 'Shipping Length (Inches)', 'Shipping Width (Inches)',
    'Fit Quality', 'Volume Utilization (%)',
    'Dim Weight (lbs)', 'Dim Weight Flag', 'Overweight Flag', 'Error',
  ];

  const dataRows = shipments.map((s: any) => {
    const best = s.best;
    const itemsSummary = (s.items ?? [])
      .map((i: any) => `${i.product.id} ×${i.quantity}`)
      .join(', ');

    // For bubble/poly mailers, actual sealed height = mailer material + stacked product thickness.
    // All other packaging uses the fixed external height.
    let shippingHeight: number | string = '';
    if (best) {
      const pkg = best.packaging as Packaging;
      if ((pkg.type === 'bubble_mailer' || pkg.type === 'poly_mailer') && pkg.max_height != null) {
        const packagedItems = (s.items ?? []).filter((i: any) => !i.product.ships_in_own_packaging);
        const productThickness = packagedItems.reduce((sum: number, i: any) => {
          const fp = foldedProduct(i.product as Product);
          const [, , t] = sortedDims(fp.height, fp.width, fp.length);
          return sum + t * i.quantity;
        }, 0);
        shippingHeight = Math.round((pkg.height + productThickness) * 1000) / 1000;
      } else {
        shippingHeight = pkg.height;
      }
    }

    return [
      s.id,
      itemsSummary,
      s.total_item_count ?? '',
      best ? best.products_weight : '',
      best ? best.packaging_weight : '',
      best ? Math.round((best.products_weight + best.packaging_weight) * 1000) / 1000 : '',
      best ? best.total_weight : '',
      best ? best.packaging.name : '',
      shippingHeight,
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
  ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 14 : i === 1 ? 32 : h.length + 4 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename="bulk-results.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Type helper (not actually called, just for TS)
function buildShipmentRow(_: unknown) { return _; }

// ── Settings ──────────────────────────────────────────────────────────────────

// Secrets and credentials must never leave through the public settings endpoint.
const SENSITIVE_SETTINGS = new Set([
  'admin_password_hash', 'api_key_hash', 'smtp_pass', 'smtp_user', 'salsify_org_id',
]);

function publicSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.filter(r => !SENSITIVE_SETTINGS.has(r.key)).map(r => [r.key, r.value]));
}

router.get('/settings', (_req, res) => {
  res.json(publicSettings());
});

router.put('/settings', requireEdit('settings'), (req: Request, res: Response) => {
  const { dim_divisor, pack_efficiency, weight_unit, dim_unit, ltl_threshold, fit_clearance,
          backup_frequency, backup_hour, backup_max_count } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction(() => {
    if (dim_divisor != null) upsert.run('dim_divisor', String(Number(dim_divisor)));
    if (pack_efficiency != null) upsert.run('pack_efficiency', String(Number(pack_efficiency)));
    if (weight_unit) upsert.run('weight_unit', weight_unit);
    if (dim_unit) upsert.run('dim_unit', dim_unit);
    if (ltl_threshold != null) upsert.run('ltl_threshold', String(Number(ltl_threshold)));
    if (fit_clearance != null) upsert.run('fit_clearance', String(Number(fit_clearance)));
    if (backup_frequency) upsert.run('backup_frequency', backup_frequency);
    if (backup_hour != null) upsert.run('backup_hour', String(Number(backup_hour)));
    if (backup_max_count != null) upsert.run('backup_max_count', String(Number(backup_max_count)));
  })();
  res.json(publicSettings());
});

export default router;
