import { Router, Request, Response } from 'express';
import db from '../db';
import { Packaging } from '../types';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const packaging = db.prepare('SELECT * FROM packaging ORDER BY type, name').all();
  res.json(packaging);
});

router.get('/:id', (req: Request, res: Response) => {
  const pkg = db.prepare('SELECT * FROM packaging WHERE id = ?').get(Number(req.params.id));
  if (!pkg) return res.status(404).json({ error: 'Packaging not found' });
  res.json(pkg);
});

router.post('/', (req: Request, res: Response) => {
  const { name, type, height, width, length, max_weight, max_height, packaging_weight, notes, active } = req.body as Packaging;
  if (!name || !type || height == null || width == null || length == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = db.prepare(`
    INSERT INTO packaging (name, type, height, width, length, max_weight, max_height, packaging_weight, notes, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    type,
    Number(height),
    Number(width),
    Number(length),
    max_weight != null ? Number(max_weight) : null,
    max_height != null ? Number(max_height) : null,
    packaging_weight != null ? Number(packaging_weight) : null,
    notes ?? null,
    active !== undefined ? Number(active) : 1
  );

  res.status(201).json(db.prepare('SELECT * FROM packaging WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM packaging WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Packaging not found' });

  const { name, type, height, width, length, max_weight, max_height, packaging_weight, notes, active } = req.body as Packaging;

  db.prepare(`
    UPDATE packaging SET name = ?, type = ?, height = ?, width = ?, length = ?,
    max_weight = ?, max_height = ?, packaging_weight = ?, notes = ?, active = ?,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name,
    type,
    Number(height),
    Number(width),
    Number(length),
    max_weight != null ? Number(max_weight) : null,
    max_height != null ? Number(max_height) : null,
    packaging_weight != null ? Number(packaging_weight) : null,
    notes ?? null,
    active !== undefined ? Number(active) : 1,
    id
  );

  res.json(db.prepare('SELECT * FROM packaging WHERE id = ?').get(id));
});

router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM packaging WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Packaging not found' });
  db.prepare('DELETE FROM packaging WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
