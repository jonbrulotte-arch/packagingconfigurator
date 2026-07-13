import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db';
import { ShippingMethod, ShippingRate } from '../types';
import { requireEdit } from './auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const RATE_HEADERS = ['Method Name', 'Up To Weight (lbs)', 'Rate ($)'];

router.get('/', (_req: Request, res: Response) => {
  res.json(db.prepare('SELECT * FROM shipping_methods ORDER BY sort_order, min_weight, id').all());
});

router.post('/', requireEdit('shipping'), (req: Request, res: Response) => {
  const { name, min_weight, max_weight, dim_divisor, dim_threshold, active, is_ltl, notes, sort_order } = req.body as Partial<ShippingMethod>;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare(`
      INSERT INTO shipping_methods (name, min_weight, max_weight, dim_divisor, dim_threshold, active, is_ltl, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      min_weight != null ? Number(min_weight) : 0,
      max_weight != null ? Number(max_weight) : null,
      dim_divisor != null ? Number(dim_divisor) : null,
      dim_threshold != null ? Number(dim_threshold) : null,
      active !== undefined ? Number(active) : 1,
      is_ltl !== undefined ? Number(is_ltl) : 0,
      notes?.trim() || null,
      sort_order != null ? Number(sort_order) : 0,
    );
    res.status(201).json(db.prepare('SELECT * FROM shipping_methods WHERE id = ?').get(result.lastInsertRowid));
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'A method with that name already exists' });
    throw e;
  }
});

router.put('/:id', requireEdit('shipping'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM shipping_methods WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Method not found' });
  }
  const { name, min_weight, max_weight, dim_divisor, dim_threshold, active, is_ltl, notes, sort_order } = req.body as Partial<ShippingMethod>;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    db.prepare(`
      UPDATE shipping_methods SET name = ?, min_weight = ?, max_weight = ?,
        dim_divisor = ?, dim_threshold = ?, active = ?, is_ltl = ?, notes = ?, sort_order = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name.trim(),
      min_weight != null ? Number(min_weight) : 0,
      max_weight != null ? Number(max_weight) : null,
      dim_divisor != null ? Number(dim_divisor) : null,
      dim_threshold != null ? Number(dim_threshold) : null,
      active !== undefined ? Number(active) : 1,
      is_ltl !== undefined ? Number(is_ltl) : 0,
      notes?.trim() || null,
      sort_order != null ? Number(sort_order) : 0,
      id,
    );
    res.json(db.prepare('SELECT * FROM shipping_methods WHERE id = ?').get(id));
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'A method with that name already exists' });
    throw e;
  }
});

router.delete('/:id', requireEdit('shipping'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM shipping_methods WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Method not found' });
  }
  db.prepare('DELETE FROM shipping_methods WHERE id = ?').run(id);
  res.json({ success: true });
});

// ── Rate cards (single zone, by-weight breaks) ────────────────────────────────

router.get('/rates/template', (_req: Request, res: Response) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    RATE_HEADERS,
    ['USPS Ground Advantage', 1, 4.50],
    ['USPS Ground Advantage', 2, 5.10],
    ['USPS Ground Advantage', 5, 7.25],
    ['UPS Ground', 1, 8.90],
    ['UPS Ground', 5, 11.40],
    ['UPS Ground', 10, 15.75],
  ]);
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Rates');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="shipping-rates-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/rates/export', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT m.name AS method_name, r.max_weight, r.rate
    FROM shipping_rates r JOIN shipping_methods m ON m.id = r.method_id
    ORDER BY m.sort_order, m.name, r.max_weight
  `).all() as { method_name: string; max_weight: number; rate: number }[];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    RATE_HEADERS,
    ...rows.map(r => [r.method_name, r.max_weight, r.rate]),
  ]);
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Rates');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="shipping-rates-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// Import replaces the entire rate card of every method mentioned in the sheet.
router.post('/rates/import', requireEdit('shipping'), upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  if (rawRows.length === 0) return res.status(400).json({ error: 'Spreadsheet is empty' });

  const methods = db.prepare('SELECT id, name FROM shipping_methods').all() as { id: number; name: string }[];
  const methodByName = new Map(methods.map(m => [m.name.trim().toLowerCase(), m.id]));

  const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
  const errors: string[] = [];
  // methodId -> Map<max_weight, rate>; last row wins on duplicate breaks within the file
  const cards = new Map<number, Map<number, number>>();

  for (let i = 0; i < rawRows.length; i++) {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawRows[i])) r[normalize(k)] = v;

    const methodName = String(r['methodname'] ?? r['method'] ?? r['name'] ?? '').trim();
    const maxWeight = Number(r['uptoweightlbs'] ?? r['uptoweight'] ?? r['maxweight'] ?? r['weight'] ?? NaN);
    const rate = Number(r['rate'] ?? r['price'] ?? r['cost'] ?? NaN);

    if (!methodName) { errors.push(`Row ${i + 2}: missing Method Name — skipped`); continue; }
    const methodId = methodByName.get(methodName.toLowerCase());
    if (methodId == null) { errors.push(`Row ${i + 2}: unknown method "${methodName}" — skipped`); continue; }
    if (isNaN(maxWeight) || maxWeight <= 0) { errors.push(`Row ${i + 2}: invalid weight — skipped`); continue; }
    if (isNaN(rate) || rate < 0) { errors.push(`Row ${i + 2}: invalid rate — skipped`); continue; }

    let card = cards.get(methodId);
    if (!card) { card = new Map(); cards.set(methodId, card); }
    card.set(maxWeight, rate);
  }

  let imported = 0;
  db.transaction(() => {
    const del = db.prepare('DELETE FROM shipping_rates WHERE method_id = ?');
    const ins = db.prepare('INSERT INTO shipping_rates (method_id, max_weight, rate) VALUES (?, ?, ?)');
    for (const [methodId, card] of cards.entries()) {
      del.run(methodId);
      for (const [maxWeight, rate] of card.entries()) {
        ins.run(methodId, maxWeight, rate);
        imported++;
      }
    }
  })();

  res.json({ imported, methods_updated: cards.size, errors });
});

router.get('/:id/rates', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM shipping_methods WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Method not found' });
  }
  const rates = db
    .prepare('SELECT * FROM shipping_rates WHERE method_id = ? ORDER BY max_weight ASC')
    .all(id) as ShippingRate[];
  res.json(rates);
});

// Full replace of one method's rate card (simplest contract for the inline editor).
router.put('/:id/rates', requireEdit('shipping'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM shipping_methods WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Method not found' });
  }
  const { rates } = req.body as { rates?: { max_weight: unknown; rate: unknown }[] };
  if (!Array.isArray(rates)) return res.status(400).json({ error: 'rates must be an array' });

  const cleaned: { max_weight: number; rate: number }[] = [];
  const seen = new Set<number>();
  for (const r of rates) {
    const maxWeight = Number(r.max_weight);
    const rate = Number(r.rate);
    if (isNaN(maxWeight) || maxWeight <= 0) return res.status(400).json({ error: 'Each break needs a weight greater than 0' });
    if (isNaN(rate) || rate < 0) return res.status(400).json({ error: 'Each break needs a rate of 0 or more' });
    if (seen.has(maxWeight)) return res.status(400).json({ error: `Duplicate weight break: ${maxWeight} lbs` });
    seen.add(maxWeight);
    cleaned.push({ max_weight: maxWeight, rate });
  }

  db.transaction(() => {
    db.prepare('DELETE FROM shipping_rates WHERE method_id = ?').run(id);
    const ins = db.prepare('INSERT INTO shipping_rates (method_id, max_weight, rate) VALUES (?, ?, ?)');
    for (const r of cleaned) ins.run(id, r.max_weight, r.rate);
  })();

  const saved = db
    .prepare('SELECT * FROM shipping_rates WHERE method_id = ? ORDER BY max_weight ASC')
    .all(id) as ShippingRate[];
  res.json(saved);
});

export default router;
