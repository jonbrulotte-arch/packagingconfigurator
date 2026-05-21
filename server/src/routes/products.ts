import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db';
import { Product } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', (_req: Request, res: Response) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id').all();
  res.json(products);
});

router.get('/:id', (req: Request, res: Response) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

router.post('/', (req: Request, res: Response) => {
  const { id, name, height, width, length, weight, foldable } = req.body as Product;
  if (!id || !name || height == null || width == null || length == null || weight == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (existing) return res.status(409).json({ error: 'Product ID already exists' });

  db.prepare(
    'INSERT INTO products (id, name, height, width, length, weight, foldable) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, Number(height), Number(width), Number(length), Number(weight), foldable ? 1 : 0);

  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
});

router.put('/:id', (req: Request, res: Response) => {
  const { name, height, width, length, weight, foldable } = req.body as Product;
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  db.prepare(
    `UPDATE products SET name = ?, height = ?, width = ?, length = ?, weight = ?, foldable = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(name, Number(height), Number(width), Number(length), Number(weight), foldable ? 1 : 0, req.params.id);

  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/import', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  if (rows.length === 0) return res.status(400).json({ error: 'Spreadsheet is empty' });

  const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

  const colMap = (row: Record<string, unknown>) => {
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) normalized[normalize(k)] = v;
    return normalized;
  };

  const upsert = db.prepare(`
    INSERT INTO products (id, name, height, width, length, weight, foldable)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      height = excluded.height,
      width = excluded.width,
      length = excluded.length,
      weight = excluded.weight,
      foldable = excluded.foldable,
      updated_at = CURRENT_TIMESTAMP
  `);

  const upsertMany = db.transaction((rows: Record<string, unknown>[]) => {
    let imported = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = colMap(rows[i]);
      const id = String(r['partnumber'] ?? r['productid'] ?? r['id'] ?? '').trim();
      const name = String(r['itemname'] ?? r['productname'] ?? r['name'] ?? '').trim();
      const height = Number(r['upcheightinches'] ?? r['heightin'] ?? r['height'] ?? 0);
      const width = Number(r['upcwidthinches'] ?? r['widthin'] ?? r['width'] ?? 0);
      const length = Number(r['upclengthinches'] ?? r['lengthin'] ?? r['length'] ?? 0);
      const weight = Number(r['upcweightpounds'] ?? r['weightlbs'] ?? r['weight'] ?? 0);

      const foldableRaw = String(r['foldable'] ?? '').toLowerCase().trim();
      const foldable = ['1', 'true', 'yes', 'y'].includes(foldableRaw) ? 1 : 0;

      if (!id || !name) {
        errors.push(`Row ${i + 2}: missing product ID or name`);
        continue;
      }
      if ([height, width, length, weight].some(isNaN)) {
        errors.push(`Row ${i + 2}: invalid numeric dimension`);
        continue;
      }

      upsert.run(id, name, height, width, length, weight, foldable);
      imported++;
    }

    return { imported, errors };
  });

  const result = upsertMany(rows);
  res.json(result);
});

export default router;
