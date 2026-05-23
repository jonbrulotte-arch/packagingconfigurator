import { Router, Request, Response } from 'express';
import db from '../db';
import { ShippingMethod } from '../types';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(db.prepare('SELECT * FROM shipping_methods ORDER BY sort_order, min_weight, id').all());
});

router.post('/', (req: Request, res: Response) => {
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

router.put('/:id', (req: Request, res: Response) => {
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

router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM shipping_methods WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Method not found' });
  }
  db.prepare('DELETE FROM shipping_methods WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
