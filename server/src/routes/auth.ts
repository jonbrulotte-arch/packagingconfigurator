import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import db from '../db';

const router = Router();

const sessions = new Map<string, number>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// One-time recovery token printed to console at startup — regenerated on every restart
const recoveryToken = randomBytes(16).toString('hex');
console.log(`\n[Auth] Emergency recovery token: ${recoveryToken}`);
console.log(`       POST /api/auth/emergency-reset?token=${recoveryToken}  to clear the admin password.\n`);

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function getStoredHash(): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_hash') as { value: string } | undefined;
  return row?.value ?? null;
}

function isValidToken(token: string): boolean {
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) { sessions.delete(token); return false; }
  return true;
}

// Is a password set?
router.get('/status', (_req: Request, res: Response) => {
  res.json({ protected: getStoredHash() !== null });
});

// Verify current session token
router.get('/verify', (req: Request, res: Response) => {
  if (getStoredHash() === null) return res.json({ authenticated: true });
  const token = req.headers['x-session-token'] as string | undefined;
  res.json({ authenticated: token ? isValidToken(token) : false });
});

// Login
router.post('/login', (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const hash = getStoredHash();
  if (!hash) return res.json({ token: null, success: true });
  if (!password || sha256(password) !== hash) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const token = randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.json({ token, success: true });
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  const token = req.headers['x-session-token'] as string | undefined;
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// Set or change password
router.post('/set-password', (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  const hash = getStoredHash();
  if (hash) {
    if (!currentPassword || sha256(currentPassword) !== hash) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('admin_password_hash', sha256(newPassword));
  sessions.clear();
  res.json({ success: true });
});

// Remove password
router.post('/remove-password', (req: Request, res: Response) => {
  const { currentPassword } = req.body as { currentPassword?: string };
  const hash = getStoredHash();
  if (!hash) return res.json({ success: true });
  if (!currentPassword || sha256(currentPassword) !== hash) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('DELETE FROM settings WHERE key = ?').run('admin_password_hash');
  sessions.clear();
  res.json({ success: true });
});

// Emergency password reset using the startup console token
router.post('/emergency-reset', (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };
  if (!token || token !== recoveryToken) {
    return res.status(401).json({ error: 'Invalid or missing recovery token' });
  }
  db.prepare('DELETE FROM settings WHERE key = ?').run('admin_password_hash');
  sessions.clear();
  res.json({ success: true, message: 'Admin password cleared. Access admin pages without a password.' });
});

export default router;
