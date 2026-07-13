import { Router, Request, Response } from 'express';
import db from '../db';
import path from 'path';
import fs from 'fs';

const router = Router();

const BACKUP_DIR = path.join(__dirname, '../../../data/backups');
const DB_PATH = path.join(__dirname, '../../../data/packaging.db');

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

export async function createBackup(): Promise<{ filename: string; size: number; created_at: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  await db.backup(dest);
  const stat = fs.statSync(dest);
  return { filename, size: stat.size, created_at: stat.mtime.toISOString() };
}

// Returns all backup-*.db files sorted newest first (excludes pre-restore safety copies).
export function listRegularBackups(): { filename: string; size: number; created_at: string }[] {
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Deletes the oldest backup-*.db files so that at most maxCount remain.
// Pre-restore safety copies are never touched.
export function pruneOldBackups(maxCount: number): void {
  if (maxCount <= 0) return;
  const backups = listRegularBackups();
  const toDelete = backups.slice(maxCount);
  for (const b of toDelete) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.filename)); } catch {}
  }
}

// List all backups (regular + pre-restore), newest first
router.get('/', (_req: Request, res: Response) => {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json(files);
});

// Create manual backup (no automatic pruning — user manages manually)
router.post('/', async (_req: Request, res: Response) => {
  try {
    const backup = await createBackup();
    res.json(backup);
  } catch {
    res.status(500).json({ error: 'Backup failed' });
  }
});

// Download backup
router.get('/download/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup not found' });
  res.download(filepath, filename);
});

// Restore from backup
router.post('/restore/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const src = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'Backup not found' });

  // Safety copy before overwriting
  const safetyTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safetyPath = path.join(BACKUP_DIR, `pre-restore-${safetyTimestamp}.db`);
  if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, safetyPath);

  fs.copyFileSync(src, DB_PATH);
  res.json({ success: true, message: 'Database restored. Server is restarting.' });
  setTimeout(() => process.exit(0), 500);
});

// Delete backup
router.delete('/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup not found' });
  fs.unlinkSync(filepath);
  res.json({ success: true });
});

export default router;
