import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db';
import { requireView, requireEdit } from './auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Pricing is the one module where anonymous visitors don't get read access.
const view = requireView('pricing');
const edit = requireEdit('pricing');

// ── Types ─────────────────────────────────────────────────────────────────────

interface SalesChannelRow {
  id: number;
  name: string;
  shipping_terms: 'prepaid' | 'collect';
  payment_terms: string | null;
  transaction_fee: number;
  min_margin_pct: number;
  notes: string | null;
  active: number;
}

interface ChannelAllocationRow {
  id: number;
  channel_id: number;
  label: string;
  alloc_type: 'fixed' | 'percent';
  value: number;
  sort_order: number;
}

function loadChannel(id: number) {
  const channel = db.prepare('SELECT * FROM sales_channels WHERE id = ?').get(id) as SalesChannelRow | undefined;
  if (!channel) return null;
  const allocations = db.prepare('SELECT * FROM channel_allocations WHERE channel_id = ? ORDER BY sort_order, id').all(id) as ChannelAllocationRow[];
  return { ...channel, allocations };
}

function replaceAllocations(channelId: number, allocations: unknown) {
  db.prepare('DELETE FROM channel_allocations WHERE channel_id = ?').run(channelId);
  if (!Array.isArray(allocations)) return;
  const ins = db.prepare('INSERT INTO channel_allocations (channel_id, label, alloc_type, value, sort_order) VALUES (?, ?, ?, ?, ?)');
  allocations.forEach((a: unknown, i: number) => {
    const row = a as { label?: string; alloc_type?: string; value?: number };
    const label = String(row.label ?? '').trim();
    const alloc_type = row.alloc_type === 'percent' ? 'percent' : 'fixed';
    const value = Number(row.value);
    if (!label || isNaN(value)) return;
    ins.run(channelId, label, alloc_type, value, i);
  });
}

// ── Sales channels ────────────────────────────────────────────────────────────

router.get('/channels', view, (_req: Request, res: Response) => {
  const channels = db.prepare('SELECT id FROM sales_channels ORDER BY name').all() as { id: number }[];
  res.json(channels.map(c => loadChannel(c.id)));
});

router.post('/channels', edit, (req: Request, res: Response) => {
  const { name, shipping_terms, payment_terms, transaction_fee, min_margin_pct, notes, active, allocations } = req.body as Record<string, unknown>;
  const cleanName = String(name ?? '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare(`
      INSERT INTO sales_channels (name, shipping_terms, payment_terms, transaction_fee, min_margin_pct, notes, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanName,
      shipping_terms === 'collect' ? 'collect' : 'prepaid',
      payment_terms ? String(payment_terms).trim() : null,
      transaction_fee != null ? Number(transaction_fee) : 0,
      min_margin_pct != null ? Number(min_margin_pct) : 0,
      notes ? String(notes).trim() : null,
      active !== undefined ? (active ? 1 : 0) : 1,
    );
    const id = Number(result.lastInsertRowid);
    replaceAllocations(id, allocations);
    res.status(201).json(loadChannel(id));
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'A channel with that name already exists' });
    throw e;
  }
});

router.put('/channels/:id', edit, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM sales_channels WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  const { name, shipping_terms, payment_terms, transaction_fee, min_margin_pct, notes, active, allocations } = req.body as Record<string, unknown>;
  const cleanName = String(name ?? '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });
  try {
    db.prepare(`
      UPDATE sales_channels SET name = ?, shipping_terms = ?, payment_terms = ?, transaction_fee = ?,
        min_margin_pct = ?, notes = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      cleanName,
      shipping_terms === 'collect' ? 'collect' : 'prepaid',
      payment_terms ? String(payment_terms).trim() : null,
      transaction_fee != null ? Number(transaction_fee) : 0,
      min_margin_pct != null ? Number(min_margin_pct) : 0,
      notes ? String(notes).trim() : null,
      active !== undefined ? (active ? 1 : 0) : 1,
      id,
    );
    replaceAllocations(id, allocations);
    res.json(loadChannel(id));
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'A channel with that name already exists' });
    throw e;
  }
});

router.delete('/channels/:id', edit, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM sales_channels WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  db.prepare('DELETE FROM sales_channels WHERE id = ?').run(id); // allocations cascade
  res.json({ success: true });
});

// ── Per-product pricing ───────────────────────────────────────────────────────

const PRICING_HEADERS = ['Part Number', 'Product Cost ($)', 'Retail Price ($)'];

router.get('/product-pricing', view, (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT p.id AS product_id, p.name, pp.product_cost, pp.retail_price
    FROM products p LEFT JOIN product_pricing pp ON pp.product_id = p.id
    ORDER BY p.id
  `).all();
  res.json(rows);
});

router.put('/product-pricing/:productId', edit, (req: Request, res: Response) => {
  const productId = req.params.productId;
  if (!db.prepare('SELECT id FROM products WHERE id = ?').get(productId)) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const { product_cost, retail_price } = req.body as { product_cost?: number | null; retail_price?: number | null };
  db.prepare(`
    INSERT INTO product_pricing (product_id, product_cost, retail_price)
    VALUES (?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET
      product_cost = excluded.product_cost, retail_price = excluded.retail_price, updated_at = CURRENT_TIMESTAMP
  `).run(productId, product_cost != null ? Number(product_cost) : null, retail_price != null ? Number(retail_price) : null);
  const row = db.prepare('SELECT product_id, product_cost, retail_price FROM product_pricing WHERE product_id = ?').get(productId);
  res.json(row);
});

router.get('/product-pricing/template', view, (_req: Request, res: Response) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    PRICING_HEADERS,
    ['SKU-001', 4.50, 12.99],
    ['SKU-002', 8.10, 24.99],
  ]);
  ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Pricing');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="product-pricing-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/product-pricing/export', view, (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT p.id, pp.product_cost, pp.retail_price
    FROM products p LEFT JOIN product_pricing pp ON pp.product_id = p.id
    ORDER BY p.id
  `).all() as { id: string; product_cost: number | null; retail_price: number | null }[];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    PRICING_HEADERS,
    ...rows.map(r => [r.id, r.product_cost ?? '', r.retail_price ?? '']),
  ]);
  ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Pricing');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="product-pricing-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.post('/product-pricing/import', edit, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  if (rawRows.length === 0) return res.status(400).json({ error: 'Spreadsheet is empty' });

  const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
  const exists = db.prepare('SELECT 1 FROM products WHERE id = ?');
  const upsert = db.prepare(`
    INSERT INTO product_pricing (product_id, product_cost, retail_price)
    VALUES (?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET
      product_cost = excluded.product_cost, retail_price = excluded.retail_price, updated_at = CURRENT_TIMESTAMP
  `);

  let imported = 0;
  const errors: string[] = [];
  db.transaction(() => {
    for (let i = 0; i < rawRows.length; i++) {
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawRows[i])) r[normalize(k)] = v;
      const id = String(r['partnumber'] ?? r['productid'] ?? r['id'] ?? '').trim();
      if (!id) { errors.push(`Row ${i + 2}: missing Part Number — skipped`); continue; }
      if (!exists.get(id)) { errors.push(`Row ${i + 2}: unknown product "${id}" — skipped`); continue; }
      const costRaw = r['productcostdollar'] ?? r['productcost'] ?? r['cost'] ?? '';
      const retailRaw = r['retailpricedollar'] ?? r['retailprice'] ?? r['price'] ?? '';
      const cost = costRaw === '' ? null : Number(costRaw);
      const retail = retailRaw === '' ? null : Number(retailRaw);
      if ((cost != null && isNaN(cost)) || (retail != null && isNaN(retail))) {
        errors.push(`Row ${i + 2} (${id}): invalid number — skipped`); continue;
      }
      upsert.run(id, cost, retail);
      imported++;
    }
  })();

  res.json({ imported, errors });
});

// ── ROI computation (on demand — arithmetic over the cached packaging analysis) ──

interface ProductResultEntryLite {
  id: string;
  name: string;
  cheapest_shipping: { rate: number } | null;
}

interface RoiRow {
  product_id: string;
  name: string;
  channel_id: number;
  channel_name: string;
  retail_price: number | null;
  product_cost: number | null;
  shipping_cost: number | null;
  allocations_total: number | null;
  fees_total: number | null;
  margin: number | null;
  margin_pct: number | null;
  status: 'red' | 'yellow' | 'ok' | 'no_data' | 'no_rate';
}

function computeRoi(channelFilter?: number): { computed_at: string | null; channels: SalesChannelRow[]; rows: RoiRow[] } | null {
  const cached = db.prepare("SELECT status, payload, computed_at FROM report_cache WHERE type = 'packaging_analysis'").get() as
    | { status: string; payload: string | null; computed_at: string | null }
    | undefined;
  if (!cached || cached.status !== 'ready' || !cached.payload) return null;

  const payload = JSON.parse(cached.payload) as { product_results?: ProductResultEntryLite[] };
  const shippingByProduct = new Map((payload.product_results ?? []).map(p => [p.id, p.cheapest_shipping]));

  let channels = db.prepare('SELECT * FROM sales_channels WHERE active = 1 ORDER BY name').all() as SalesChannelRow[];
  if (channelFilter != null) channels = channels.filter(c => c.id === channelFilter);

  const allocationsByChannel = new Map<number, ChannelAllocationRow[]>();
  for (const c of channels) {
    allocationsByChannel.set(c.id, db.prepare('SELECT * FROM channel_allocations WHERE channel_id = ? ORDER BY sort_order, id').all(c.id) as ChannelAllocationRow[]);
  }

  const pricing = db.prepare(`
    SELECT p.id, p.name, pp.product_cost, pp.retail_price
    FROM products p LEFT JOIN product_pricing pp ON pp.product_id = p.id
  `).all() as { id: string; name: string; product_cost: number | null; retail_price: number | null }[];

  const rows: RoiRow[] = [];

  for (const product of pricing) {
    for (const channel of channels) {
      const retail = product.retail_price;
      const cost = product.product_cost;

      if (retail == null || retail <= 0 || cost == null) {
        rows.push({
          product_id: product.id, name: product.name, channel_id: channel.id, channel_name: channel.name,
          retail_price: retail, product_cost: cost, shipping_cost: null,
          allocations_total: null, fees_total: null, margin: null, margin_pct: null, status: 'no_data',
        });
        continue;
      }

      const shippingCost = shippingByProduct.get(product.id)?.rate ?? null;
      if (channel.shipping_terms === 'prepaid' && shippingCost == null) {
        rows.push({
          product_id: product.id, name: product.name, channel_id: channel.id, channel_name: channel.name,
          retail_price: retail, product_cost: cost, shipping_cost: null,
          allocations_total: null, fees_total: null, margin: null, margin_pct: null, status: 'no_rate',
        });
        continue;
      }

      const allocations = allocationsByChannel.get(channel.id) ?? [];
      const fixedTotal = allocations.filter(a => a.alloc_type === 'fixed').reduce((s, a) => s + a.value, 0);
      const percentTotal = allocations.filter(a => a.alloc_type === 'percent').reduce((s, a) => s + a.value, 0);
      const percentDollar = retail * (percentTotal / 100);
      const shippingApplied = channel.shipping_terms === 'prepaid' ? (shippingCost ?? 0) : 0;
      const feesTotal = channel.transaction_fee + fixedTotal + percentDollar;
      const margin = Math.round((retail - (cost + feesTotal + shippingApplied)) * 100) / 100;
      const marginPct = Math.round((margin / retail) * 1000) / 10;

      const status: RoiRow['status'] = margin <= 0 ? 'red' : marginPct < channel.min_margin_pct ? 'yellow' : 'ok';

      rows.push({
        product_id: product.id, name: product.name, channel_id: channel.id, channel_name: channel.name,
        retail_price: retail, product_cost: cost, shipping_cost: channel.shipping_terms === 'prepaid' ? shippingApplied : shippingCost,
        allocations_total: Math.round((fixedTotal + percentDollar) * 100) / 100,
        fees_total: Math.round(feesTotal * 100) / 100,
        margin, margin_pct: marginPct, status,
      });
    }
  }

  return { computed_at: cached.computed_at, channels, rows };
}

router.get('/roi', view, (req: Request, res: Response) => {
  const { channel_id, status } = req.query as { channel_id?: string; status?: string };
  const result = computeRoi(channel_id ? Number(channel_id) : undefined);
  if (!result) return res.status(400).json({ error: 'Run the Packaging Analysis report first — ROI uses its best-fit shipping costs' });

  const rows = status ? result.rows.filter(r => r.status === status) : result.rows;
  const summary = { red: 0, yellow: 0, ok: 0, no_data: 0, no_rate: 0 };
  for (const r of result.rows) summary[r.status]++;

  res.json({
    computed_at: result.computed_at,
    channels: result.channels.map(c => ({ id: c.id, name: c.name, shipping_terms: c.shipping_terms, min_margin_pct: c.min_margin_pct })),
    summary,
    rows,
  });
});

router.get('/roi/export', view, (_req: Request, res: Response) => {
  const result = computeRoi();
  if (!result) return res.status(400).json({ error: 'Run the Packaging Analysis report first' });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Product ID', 'Name', 'Channel', 'Retail Price', 'Product Cost', 'Shipping Cost', 'Fees & Allocations', 'Margin ($)', 'Margin %', 'Status'],
    ...result.rows.map(r => [
      r.product_id, r.name, r.channel_name, r.retail_price ?? '', r.product_cost ?? '',
      r.shipping_cost ?? '', r.fees_total ?? '', r.margin ?? '', r.margin_pct ?? '', r.status,
    ]),
  ]);
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'ROI');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="roi-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

export default router;
