import { Router, Request, Response } from 'express';
import db from '../db';
import { ShippingMethod, ShippingRate, ShippingMethodWithRates } from '../types';

const router = Router();

function getMethodWithRates(id: number): ShippingMethodWithRates | undefined {
  const method = db.prepare('SELECT * FROM shipping_methods WHERE id = ?').get(id) as ShippingMethod | undefined;
  if (!method) return undefined;
  const rates = db.prepare('SELECT * FROM shipping_rates WHERE method_id = ? ORDER BY max_weight').all(id) as ShippingRate[];
  return { ...method, rates };
}

// List all methods with their rates
router.get('/', (_req: Request, res: Response) => {
  const methods = db.prepare('SELECT * FROM shipping_methods ORDER BY sort_order, id').all() as ShippingMethod[];
  const rates = db.prepare('SELECT * FROM shipping_rates ORDER BY max_weight').all() as ShippingRate[];
  const ratesByMethod = new Map<number, ShippingRate[]>();
  for (const r of rates) {
    if (!ratesByMethod.has(r.method_id)) ratesByMethod.set(r.method_id, []);
    ratesByMethod.get(r.method_id)!.push(r);
  }
  res.json(methods.map(m => ({ ...m, rates: ratesByMethod.get(m.id) ?? [] })));
});

// Delete a rate — must come before /:id to avoid route conflict
router.delete('/rates/:rateId', (req: Request, res: Response) => {
  const rateId = Number(req.params.rateId);
  const existing = db.prepare('SELECT id FROM shipping_rates WHERE id = ?').get(rateId);
  if (!existing) return res.status(404).json({ error: 'Rate not found' });
  db.prepare('DELETE FROM shipping_rates WHERE id = ?').run(rateId);
  res.json({ success: true });
});

// Update a rate
router.put('/rates/:rateId', (req: Request, res: Response) => {
  const rateId = Number(req.params.rateId);
  const existing = db.prepare('SELECT id, method_id FROM shipping_rates WHERE id = ?').get(rateId) as { id: number; method_id: number } | undefined;
  if (!existing) return res.status(404).json({ error: 'Rate not found' });
  const { max_weight, label } = req.body as { max_weight?: number; label?: string };
  if (max_weight == null || !label) return res.status(400).json({ error: 'max_weight and label required' });
  db.prepare('UPDATE shipping_rates SET max_weight = ?, label = ? WHERE id = ?').run(Number(max_weight), String(label).trim(), rateId);
  res.json(db.prepare('SELECT * FROM shipping_rates WHERE id = ?').get(rateId));
});

// Create method
router.post('/', (req: Request, res: Response) => {
  const { name, dim_divisor, dim_threshold, active, notes, sort_order } = req.body as Partial<ShippingMethod>;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare(`
      INSERT INTO shipping_methods (name, dim_divisor, dim_threshold, active, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      dim_divisor != null ? Number(dim_divisor) : null,
      dim_threshold != null ? Number(dim_threshold) : null,
      active !== undefined ? Number(active) : 1,
      notes?.trim() || null,
      sort_order != null ? Number(sort_order) : 0,
    );
    res.status(201).json(getMethodWithRates(Number(result.lastInsertRowid)));
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'A method with that name already exists' });
    throw e;
  }
});

// Update method
router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM shipping_methods WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Method not found' });
  }
  const { name, dim_divisor, dim_threshold, active, notes, sort_order } = req.body as Partial<ShippingMethod>;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    db.prepare(`
      UPDATE shipping_methods SET name = ?, dim_divisor = ?, dim_threshold = ?,
        active = ?, notes = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name.trim(),
      dim_divisor != null ? Number(dim_divisor) : null,
      dim_threshold != null ? Number(dim_threshold) : null,
      active !== undefined ? Number(active) : 1,
      notes?.trim() || null,
      sort_order != null ? Number(sort_order) : 0,
      id,
    );
    res.json(getMethodWithRates(id));
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'A method with that name already exists' });
    throw e;
  }
});

// Delete method
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM shipping_methods WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Method not found' });
  }
  db.prepare('DELETE FROM shipping_methods WHERE id = ?').run(id);
  res.json({ success: true });
});

// Add rate to method
router.post('/:id/rates', (req: Request, res: Response) => {
  const methodId = Number(req.params.id);
  if (!db.prepare('SELECT id FROM shipping_methods WHERE id = ?').get(methodId)) {
    return res.status(404).json({ error: 'Method not found' });
  }
  const { max_weight, label } = req.body as { max_weight?: number; label?: string };
  if (max_weight == null || !label?.trim()) {
    return res.status(400).json({ error: 'max_weight and label are required' });
  }
  const result = db.prepare(
    'INSERT INTO shipping_rates (method_id, max_weight, label) VALUES (?, ?, ?)'
  ).run(methodId, Number(max_weight), label.trim());
  res.status(201).json(db.prepare('SELECT * FROM shipping_rates WHERE id = ?').get(result.lastInsertRowid));
});

export default router;
