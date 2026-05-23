import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db from '../db';
import { Packaging } from '../types';

function sha256(s: string) { return createHash('sha256').update(s).digest('hex'); }
function verifyAdminPassword(password: string | undefined): boolean {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_password_hash'").get() as { value: string } | undefined;
  if (!row) return true; // no password set
  return !!password && sha256(password) === row.value;
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const HEADERS = [
  'Name', 'Type', 'Height (Inches)', 'Width (Inches)', 'Length (Inches)',
  'Max Height (Inches)', 'Max Weight (Pounds)', 'Packaging Weight (Pounds)', 'Notes', 'Active',
];

const TYPE_ALIASES: Record<string, string> = {
  box: 'box', boxes: 'box',
  bubblemailer: 'bubble_mailer', 'bubble_mailer': 'bubble_mailer', bubblemailers: 'bubble_mailer',
  polymailer: 'poly_mailer', 'poly_mailer': 'poly_mailer', polymailers: 'poly_mailer',
  other: 'other',
};

function normalize(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveType(raw: string): string | null {
  const key = normalize(raw);
  return TYPE_ALIASES[key] ?? null;
}

// ── Template ──────────────────────────────────────────────────────────────────

router.get('/template', (_req: Request, res: Response) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ['Small Box 6x4x3',       'box',           3,  4,  6, '',  10, 0.3, '',            1],
    ['Medium Box 12x10x8',    'box',           8, 10, 12, '',  30, 0.6, '',            1],
    ['Large Box 18x14x12',    'box',          12, 14, 18, '',  50, 1.2, 'Heavy duty',  1],
    ['Bubble Mailer 6x9',     'bubble_mailer', 1,  6,  9, 0.75, 2, 0.1, '',           1],
    ['Bubble Mailer 9x12',    'bubble_mailer', 1,  9, 12, 1.5,  4, 0.1, '',           1],
    ['Poly Mailer 10x13',     'poly_mailer',   1, 10, 13, 1.0,  3, 0.05,'',           1],
  ]);
  ws['!cols'] = HEADERS.map((h, i) => ({ wch: i === 0 ? 24 : i === 8 ? 20 : h.length + 4 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Packaging');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="packaging-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ── Export ────────────────────────────────────────────────────────────────────

router.get('/export', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM packaging ORDER BY type, name').all() as Packaging[];
  const wb = XLSX.utils.book_new();
  const data = [
    HEADERS,
    ...rows.map(p => [
      p.name, p.type,
      p.height, p.width, p.length,
      p.max_height ?? '',
      p.max_weight ?? '',
      p.packaging_weight ?? '',
      p.notes ?? '',
      p.active,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = HEADERS.map((h, i) => ({ wch: i === 0 ? 28 : i === 8 ? 24 : h.length + 4 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Packaging');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="packaging-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ── Import ────────────────────────────────────────────────────────────────────

router.post('/import', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  if (rawRows.length === 0) return res.status(400).json({ error: 'Spreadsheet is empty' });

  const upsert = db.prepare(`
    INSERT INTO packaging (name, type, height, width, length, max_height, max_weight, packaging_weight, notes, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      type = excluded.type, height = excluded.height, width = excluded.width,
      length = excluded.length, max_height = excluded.max_height,
      max_weight = excluded.max_weight, packaging_weight = excluded.packaging_weight,
      notes = excluded.notes, active = excluded.active,
      updated_at = CURRENT_TIMESTAMP
  `);

  const importMany = db.transaction((rows: Record<string, unknown>[]) => {
    let imported = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rows[i])) r[normalize(k)] = v;

      const name = String(r['name'] ?? '').trim();
      const typeRaw = String(r['type'] ?? '').trim();
      const type = resolveType(typeRaw);
      const height = Number(r['heightinches'] ?? r['height'] ?? 0);
      const width  = Number(r['widthinches']  ?? r['width']  ?? 0);
      const length = Number(r['lengthinches'] ?? r['length'] ?? 0);
      const maxHeightRaw = r['maxheightinches'] ?? r['maxheight'] ?? '';
      const max_height = maxHeightRaw === '' ? null : Number(maxHeightRaw);
      const maxWeightRaw = r['maxweightpounds'] ?? r['maxweight'] ?? '';
      const max_weight = maxWeightRaw === '' ? null : Number(maxWeightRaw);
      const pkgWeightRaw = r['packagingweightpounds'] ?? r['packagingweight'] ?? '';
      const packaging_weight = pkgWeightRaw === '' ? null : Number(pkgWeightRaw);
      const notes = String(r['notes'] ?? '').trim() || null;
      const activeRaw = String(r['active'] ?? '1').trim().toLowerCase();
      const active = ['0', 'false', 'no', 'n', 'inactive'].includes(activeRaw) ? 0 : 1;

      if (!name) { errors.push(`Row ${i + 2}: missing Name — skipped`); continue; }
      if (!type) { errors.push(`Row ${i + 2}: invalid Type "${typeRaw}" — use box, bubble_mailer, poly_mailer, or other`); continue; }
      if ([height, width, length].some(n => isNaN(n) || n <= 0)) {
        errors.push(`Row ${i + 2}: invalid dimensions — skipped`); continue;
      }

      upsert.run(name, type, height, width, length, max_height, max_weight, packaging_weight, notes, active);
      imported++;
    }

    return { imported, errors };
  });

  const result = importMany(rawRows);
  res.json(result);
});

// ── CRUD ──────────────────────────────────────────────────────────────────────

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
    name, type,
    Number(height), Number(width), Number(length),
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
    name, type,
    Number(height), Number(width), Number(length),
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

router.post('/delete-all', (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!verifyAdminPassword(password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const result = db.prepare('DELETE FROM packaging').run();
  res.json({ success: true, deleted: result.changes });
});

export default router;
