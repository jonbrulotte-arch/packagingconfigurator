import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db';
import { Product } from '../types';
import { requireEdit } from './auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const TEMPLATE_HEADERS = [
  'Part Number', 'Item Name',
  'UPC Height (Inches)', 'UPC Width (Inches)', 'UPC Length (Inches)', 'UPC Weight (Pounds)',
  'Foldable', 'Ships In Own Packaging', 'UPC',
];

router.get('/template', (_req: Request, res: Response) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ['SKU-001', 'Widget A', 3, 4, 5, 1.2, 0, 0, ''],
    ['SKU-002', 'Widget B', 5, 5, 8, 2.8, 0, 0, ''],
    ['SKU-003', 'Soft Pouch', 0.5, 6, 10, 0.4, 1, 0, ''],
    ['SKU-004', 'Appliance', 12, 10, 18, 15.0, 0, 1, ''],
  ]);
  ws['!cols'] = [
    { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="products-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/export', (_req: Request, res: Response) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id').all() as Product[];
  const wb = XLSX.utils.book_new();
  const rows = [
    TEMPLATE_HEADERS,
    ...products.map(p => [
      p.id, p.name, p.height, p.width, p.length, p.weight,
      p.foldable ? 1 : 0, p.ships_in_own_packaging ? 1 : 0, p.upc ?? '',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 16 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="products-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/', (_req: Request, res: Response) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY id').all());
});

router.get('/:id', (req: Request, res: Response) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

router.post('/', requireEdit('products'), (req: Request, res: Response) => {
  const { id, name, height, width, length, weight, foldable, ships_in_own_packaging, upc } = req.body as Product;
  if (!id || !name || height == null || width == null || length == null || weight == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (existing) return res.status(409).json({ error: 'Product ID already exists' });

  db.prepare(
    'INSERT INTO products (id, name, height, width, length, weight, foldable, ships_in_own_packaging, upc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, Number(height), Number(width), Number(length), Number(weight), foldable ? 1 : 0, ships_in_own_packaging ? 1 : 0, upc?.trim() || null);

  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
});

router.put('/:id', requireEdit('products'), (req: Request, res: Response) => {
  const { name, height, width, length, weight, foldable, ships_in_own_packaging, upc } = req.body as Product;
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  db.prepare(
    `UPDATE products SET name = ?, height = ?, width = ?, length = ?, weight = ?, foldable = ?,
     ships_in_own_packaging = ?, upc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(name, Number(height), Number(width), Number(length), Number(weight), foldable ? 1 : 0, ships_in_own_packaging ? 1 : 0, upc?.trim() || null, req.params.id);

  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireEdit('products'), (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/import', requireEdit('products'), upload.single('file'), (req: Request, res: Response) => {
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
    INSERT INTO products (id, name, height, width, length, weight, foldable, ships_in_own_packaging, upc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      height = excluded.height,
      width = excluded.width,
      length = excluded.length,
      weight = excluded.weight,
      foldable = excluded.foldable,
      ships_in_own_packaging = excluded.ships_in_own_packaging,
      upc = excluded.upc,
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

      const siownRaw = String(r['shipsinownpackaging'] ?? r['shipsownpackaging'] ?? r['ownpackaging'] ?? '').toLowerCase().trim();
      const ships_in_own_packaging = ['1', 'true', 'yes', 'y'].includes(siownRaw) ? 1 : 0;

      const upc = String(r['upc'] ?? r['upccode'] ?? r['barcode'] ?? '').trim() || null;

      if (!id || !name) {
        errors.push(`Row ${i + 2}: missing product ID or name`);
        continue;
      }
      if ([height, width, length, weight].some(isNaN)) {
        errors.push(`Row ${i + 2}: invalid numeric dimension`);
        continue;
      }

      upsert.run(id, name, height, width, length, weight, foldable, ships_in_own_packaging, upc);
      imported++;
    }

    return { imported, errors };
  });

  const result = upsertMany(rows);
  res.json(result);
});

router.post('/delete-all', requireEdit('products'), (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM products').run();
  res.json({ success: true, deleted: result.changes });
});

export default router;
