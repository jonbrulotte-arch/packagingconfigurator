import { Router, Request, Response, NextFunction } from 'express';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import db from '../db';

const router = Router();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// One-time recovery token printed to console at startup — regenerated on every restart
const recoveryToken = randomBytes(16).toString('hex');
console.log(`\n[Auth] Emergency recovery token: ${recoveryToken}`);
console.log(`       POST /api/auth/emergency-reset?token=${recoveryToken}  to clear the admin password.\n`);

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ── Password hashing ──────────────────────────────────────────────────────────
// Legacy admin password: unsalted sha256 in settings (kept for compatibility).
// User passwords: salted scrypt, stored as 'scrypt$<saltHex>$<hashHex>'.

export function scryptHash(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyScrypt(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

function getStoredHash(): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_hash') as { value: string } | undefined;
  return row?.value ?? null;
}

function getStoredApiKeyHash(): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('api_key_hash') as { value: string } | undefined;
  return row?.value ?? null;
}

function isValidApiKey(key: string): boolean {
  const hash = getStoredApiKeyHash();
  if (!hash) return false;
  return sha256(key) === hash;
}

// ── Sessions (persisted in SQLite; survive restarts) ──────────────────────────

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
  is_admin: number;
  active: number;
}

export function createSession(userId: number | null): string {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, new Date(now + SESSION_TTL_MS).toISOString(), new Date(now).toISOString());
  return token;
}

function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}

interface SessionRow {
  token: string;
  user_id: number | null;
  expires_at: string;
}

// Returns the session row if the token is valid; deletes it lazily when expired.
function getSession(token: string): SessionRow | null {
  const row = db.prepare('SELECT token, user_id, expires_at FROM sessions WHERE token = ?').get(token) as SessionRow | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return row;
}

function getUserById(id: number): SessionUser | null {
  const row = db.prepare('SELECT id, email, name, is_admin, active FROM users WHERE id = ?').get(id) as SessionUser | undefined;
  return row ?? null;
}

// ── Privileges ────────────────────────────────────────────────────────────────

export type Module = 'products' | 'packaging' | 'shipping' | 'configurator' | 'reports' | 'pricing' | 'settings';
export type PrivilegeLevel = 'none' | 'view' | 'edit';

// Public pages every visitor can already view default to 'view' for accounts;
// restricted/admin-adjacent modules default to 'none'.
const DEFAULT_PRIVILEGES: Record<Module, PrivilegeLevel> = {
  products: 'view',
  packaging: 'view',
  shipping: 'view',
  configurator: 'view',
  reports: 'view',
  pricing: 'none',
  settings: 'none',
};

export const MODULES = Object.keys(DEFAULT_PRIVILEGES) as Module[];

export function getUserPrivileges(userId: number): Record<Module, PrivilegeLevel> {
  const rows = db.prepare('SELECT module, level FROM user_privileges WHERE user_id = ?').all(userId) as { module: string; level: PrivilegeLevel }[];
  const privileges = { ...DEFAULT_PRIVILEGES };
  for (const row of rows) {
    if (row.module in privileges) privileges[row.module as Module] = row.level;
  }
  return privileges;
}

// ── Request auth resolution ───────────────────────────────────────────────────

export type AuthInfo =
  | { kind: 'open' }                      // no admin password configured — everything allowed
  | { kind: 'legacy' }                    // legacy admin-password session (full access)
  | { kind: 'apikey' }                    // valid x-api-key (integration; full access)
  | { kind: 'user'; user: SessionUser }   // user-account session
  | { kind: 'anonymous' };                // no valid credentials

export function resolveAuth(req: Request): AuthInfo {
  if (getStoredHash() === null) return { kind: 'open' };

  const token = req.headers['x-session-token'] as string | undefined;
  if (token) {
    const session = getSession(token);
    if (session) {
      if (session.user_id == null) return { kind: 'legacy' };
      const user = getUserById(session.user_id);
      if (user && user.active) return { kind: 'user', user };
      // Deactivated or deleted mid-session — invalidate
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
  }

  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey && isValidApiKey(apiKey)) return { kind: 'apikey' };

  return { kind: 'anonymous' };
}

// Any authenticated caller (or open mode). Backward compatible with pre-user behavior.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = resolveAuth(req);
  if (auth.kind === 'anonymous') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Edit rights on a module. Legacy sessions, API keys, and open mode always pass
// (break-glass + integration compatibility); user sessions need 'edit'.
export function requireEdit(module: Module) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = resolveAuth(req);
    if (auth.kind === 'anonymous') return res.status(401).json({ error: 'Authentication required' });
    if (auth.kind === 'user') {
      if (auth.user.is_admin) return next();
      const level = getUserPrivileges(auth.user.id)[module];
      if (level !== 'edit') return res.status(403).json({ error: `You do not have edit access to ${module}` });
    }
    next();
  };
}

// View rights on a restricted module ('view' or 'edit' passes).
export function requireView(module: Module) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = resolveAuth(req);
    if (auth.kind === 'anonymous') return res.status(401).json({ error: 'Authentication required' });
    if (auth.kind === 'user') {
      if (auth.user.is_admin) return next();
      const level = getUserPrivileges(auth.user.id)[module];
      if (level === 'none') return res.status(403).json({ error: `You do not have access to ${module}` });
    }
    next();
  };
}

// Admin only: legacy session, open mode, or an is_admin user. API keys do NOT pass —
// key holders must not be able to manage accounts or the key itself.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = resolveAuth(req);
  if (auth.kind === 'open' || auth.kind === 'legacy') return next();
  if (auth.kind === 'user' && auth.user.is_admin) return next();
  return res.status(auth.kind === 'anonymous' ? 401 : 403).json({ error: 'Admin access required' });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Is a password set?
router.get('/status', (_req: Request, res: Response) => {
  res.json({ protected: getStoredHash() !== null });
});

// Verify current session token; returns the user (with privileges) for account sessions.
router.get('/verify', (req: Request, res: Response) => {
  const auth = resolveAuth(req);
  if (auth.kind === 'anonymous') return res.json({ authenticated: false, user: null });
  if (auth.kind === 'user') {
    return res.json({
      authenticated: true,
      user: {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        is_admin: auth.user.is_admin,
        privileges: getUserPrivileges(auth.user.id),
      },
    });
  }
  // open / legacy / apikey — implicit full access, no user record
  res.json({ authenticated: true, user: null });
});

// Login: body with email = user-account login; without = legacy admin password.
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  purgeExpiredSessions();

  if (email) {
    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.trim()) as
      | (SessionUser & { password_hash: string | null })
      | undefined;
    if (!user || !user.active || !user.password_hash || !password || !verifyScrypt(password, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }
    const token = createSession(user.id);
    return res.json({ token, success: true });
  }

  const hash = getStoredHash();
  if (!hash) return res.json({ token: null, success: true });
  if (!password || sha256(password) !== hash) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const token = createSession(null);
  res.json({ token, success: true });
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  const token = req.headers['x-session-token'] as string | undefined;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ success: true });
});

// Set or change the legacy admin password
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
  // Only legacy sessions are invalidated — user-account sessions stay valid.
  db.prepare('DELETE FROM sessions WHERE user_id IS NULL').run();
  res.json({ success: true });
});

// Remove the legacy admin password
router.post('/remove-password', (req: Request, res: Response) => {
  const { currentPassword } = req.body as { currentPassword?: string };
  const hash = getStoredHash();
  if (!hash) return res.json({ success: true });
  if (!currentPassword || sha256(currentPassword) !== hash) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('DELETE FROM settings WHERE key = ?').run('admin_password_hash');
  db.prepare('DELETE FROM sessions WHERE user_id IS NULL').run();
  res.json({ success: true });
});

// Emergency password reset using the startup console token
router.post('/emergency-reset', (req: Request, res: Response) => {
  const { token } = req.query as { token?: string };
  if (!token || token !== recoveryToken) {
    return res.status(401).json({ error: 'Invalid or missing recovery token' });
  }
  db.prepare('DELETE FROM settings WHERE key = ?').run('admin_password_hash');
  db.prepare('DELETE FROM sessions WHERE user_id IS NULL').run();
  res.json({ success: true, message: 'Admin password cleared. Access admin pages without a password.' });
});

// ── API key management (admin only) ───────────────────────────────────────────

router.get('/api-key', requireAdmin, (_req: Request, res: Response) => {
  res.json({ active: getStoredApiKeyHash() !== null });
});

router.post('/api-key/generate', requireAdmin, (_req: Request, res: Response) => {
  const key = randomBytes(32).toString('hex'); // 64 hex chars
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('api_key_hash', sha256(key));
  res.json({ key });
});

router.delete('/api-key', requireAdmin, (_req: Request, res: Response) => {
  db.prepare('DELETE FROM settings WHERE key = ?').run('api_key_hash');
  res.json({ success: true });
});

export default router;
