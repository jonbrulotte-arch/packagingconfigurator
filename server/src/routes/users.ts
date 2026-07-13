import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import db from '../db';
import {
  requireAdmin, resolveAuth, scryptHash, verifyScrypt,
  getUserPrivileges, MODULES, Module, PrivilegeLevel,
} from './auth';
import { isSmtpConfigured, sendInviteEmail, sendResetEmail, sendMail } from '../email';

const router = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  password_hash: string | null;
  is_admin: number;
  salsify_api_key: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    is_admin: u.is_admin,
    active: u.active,
    has_password: u.password_hash != null,
    has_salsify_key: u.salsify_api_key != null && u.salsify_api_key !== '',
    created_at: u.created_at,
    privileges: getUserPrivileges(u.id),
  };
}

function upsertPrivileges(userId: number, privileges: unknown) {
  if (privileges == null || typeof privileges !== 'object') return;
  const del = db.prepare('DELETE FROM user_privileges WHERE user_id = ? AND module = ?');
  const ins = db.prepare('INSERT OR REPLACE INTO user_privileges (user_id, module, level) VALUES (?, ?, ?)');
  for (const module of MODULES) {
    const level = (privileges as Record<string, unknown>)[module];
    if (level === 'none' || level === 'view' || level === 'edit') {
      ins.run(userId, module, level);
    } else if (level != null) {
      del.run(userId, module);
    }
  }
}

function countActiveAdmins(excludeId?: number): number {
  const row = excludeId != null
    ? db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND active = 1 AND id != ?').get(excludeId) as { c: number }
    : db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1 AND active = 1').get() as { c: number };
  return row.c;
}

// Issue a one-time token (invalidating any previous ones for the same purpose)
// and return the raw value — only its hash is stored.
function issueToken(userId: number, purpose: 'invite' | 'reset', ttlMs: number): string {
  db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose);
  const raw = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha256(raw), userId, purpose, new Date(Date.now() + ttlMs).toISOString());
  return raw;
}

function consumeToken(raw: string, purpose: 'invite' | 'reset'): UserRow | null {
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ? AND purpose = ?').get(sha256(raw), purpose) as
    | { token_hash: string; user_id: number; expires_at: string; used_at: string | null }
    | undefined;
  if (!row || row.used_at != null) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE token_hash = ?').run(new Date().toISOString(), row.token_hash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) as UserRow | undefined;
  return user ?? null;
}

// ── Admin: user management ────────────────────────────────────────────────────

router.get('/', requireAdmin, (_req: Request, res: Response) => {
  const users = db.prepare('SELECT * FROM users ORDER BY email').all() as UserRow[];
  res.json(users.map(publicUser));
});

router.post('/', requireAdmin, async (req: Request, res: Response) => {
  const { email, name, is_admin, privileges, send_invite } = req.body as {
    email?: string; name?: string; is_admin?: boolean; privileges?: unknown; send_invite?: boolean;
  };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(cleanEmail);
  if (existing) return res.status(409).json({ error: 'A user with that email already exists' });

  const result = db.prepare('INSERT INTO users (email, name, is_admin) VALUES (?, ?, ?)')
    .run(cleanEmail, name?.trim() || null, is_admin ? 1 : 0);
  const userId = Number(result.lastInsertRowid);
  upsertPrivileges(userId, privileges);

  let inviteSent = false;
  let inviteError: string | null = null;
  if (send_invite) {
    if (!isSmtpConfigured()) {
      inviteError = 'SMTP is not configured — set a password for this user manually, or configure SMTP and re-send the invitation.';
    } else {
      try {
        const raw = issueToken(userId, 'invite', INVITE_TTL_MS);
        await sendInviteEmail(cleanEmail, name?.trim() || null, raw);
        inviteSent = true;
      } catch (err) {
        inviteError = err instanceof Error ? err.message : 'Failed to send invitation email';
      }
    }
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  res.status(201).json({ ...publicUser(user), invite_sent: inviteSent, invite_error: inviteError });
});

router.put('/:id(\\d+)', requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, is_admin, active, privileges } = req.body as {
    name?: string; is_admin?: boolean; active?: boolean; privileges?: unknown;
  };

  const newAdmin = is_admin !== undefined ? (is_admin ? 1 : 0) : user.is_admin;
  const newActive = active !== undefined ? (active ? 1 : 0) : user.active;

  // Never allow the last active admin to be demoted or deactivated.
  if (user.is_admin && user.active && (!newAdmin || !newActive) && countActiveAdmins(id) === 0) {
    return res.status(400).json({ error: 'Cannot demote or deactivate the last active admin' });
  }

  db.prepare('UPDATE users SET name = ?, is_admin = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(name !== undefined ? (name.trim() || null) : user.name, newAdmin, newActive, id);
  upsertPrivileges(id, privileges);

  if (!newActive) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
  res.json(publicUser(updated));
});

router.post('/:id(\\d+)/set-password', requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.trim().length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(scryptHash(newPassword), id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ success: true });
});

router.post('/:id(\\d+)/invite', requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!isSmtpConfigured()) return res.status(503).json({ error: 'SMTP is not configured' });

  try {
    const raw = issueToken(id, 'invite', INVITE_TTL_MS);
    await sendInviteEmail(user.email, user.name, raw);
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to send invitation email' });
  }
});

router.delete('/:id(\\d+)', requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.is_admin && user.active && countActiveAdmins(id) === 0) {
    return res.status(400).json({ error: 'Cannot delete the last active admin' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id); // sessions/privileges/tokens cascade
  res.json({ success: true });
});

// ── Self-service (any user session) ──────────────────────────────────────────

router.get('/me', (req: Request, res: Response) => {
  const auth = resolveAuth(req);
  if (auth.kind !== 'user') return res.status(401).json({ error: 'A user account session is required' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id) as UserRow;
  res.json(publicUser(user));
});

router.put('/me', (req: Request, res: Response) => {
  const auth = resolveAuth(req);
  if (auth.kind !== 'user') return res.status(401).json({ error: 'A user account session is required' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user.id) as UserRow;

  const { name, currentPassword, newPassword, salsify_api_key } = req.body as {
    name?: string; currentPassword?: string; newPassword?: string; salsify_api_key?: string | null;
  };

  if (newPassword !== undefined) {
    if (!newPassword || newPassword.trim().length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!user.password_hash || !currentPassword || !verifyScrypt(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(scryptHash(newPassword), user.id);
  }

  if (name !== undefined) {
    db.prepare('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(name.trim() || null, user.id);
  }

  if (salsify_api_key !== undefined) {
    db.prepare('UPDATE users SET salsify_api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(salsify_api_key?.trim() || null, user.id);
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow;
  res.json(publicUser(updated));
});

// ── Public: password recovery + invitation acceptance ─────────────────────────

router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  // Always answer 200 so the endpoint can't be used to enumerate accounts.
  const respond = () => res.json({ success: true, message: 'If that email has an account, a reset link is on its way.' });

  const cleanEmail = email?.trim();
  if (!cleanEmail || !isSmtpConfigured()) return respond();

  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(cleanEmail) as UserRow | undefined;
  if (!user || !user.active) return respond();

  try {
    const raw = issueToken(user.id, 'reset', RESET_TTL_MS);
    await sendResetEmail(user.email, user.name, raw);
  } catch {
    // Swallow — same anti-enumeration response either way
  }
  respond();
});

router.post('/reset-password', (req: Request, res: Response) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token) return res.status(400).json({ error: 'Missing token' });
  if (!newPassword || newPassword.trim().length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const user = consumeToken(token, 'reset');
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });

  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(scryptHash(newPassword), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  res.json({ success: true });
});

router.post('/accept-invite', (req: Request, res: Response) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token) return res.status(400).json({ error: 'Missing token' });
  if (!newPassword || newPassword.trim().length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const user = consumeToken(token, 'invite');
  if (!user) return res.status(400).json({ error: 'This invitation is invalid or has expired. Ask an administrator to re-send it.' });

  db.prepare('UPDATE users SET password_hash = ?, active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(scryptHash(newPassword), user.id);
  res.json({ success: true, email: user.email });
});

// ── Admin: SMTP configuration ─────────────────────────────────────────────────

const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_from', 'app_base_url'] as const;

router.get('/smtp', requireAdmin, (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const out: Record<string, string | boolean> = {};
  for (const key of SMTP_KEYS) out[key] = s[key] ?? '';
  out.has_password = Boolean(s.smtp_pass);
  res.json(out);
});

router.put('/smtp', requireAdmin, (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction(() => {
    for (const key of SMTP_KEYS) {
      if (body[key] !== undefined) upsert.run(key, String(body[key] ?? '').trim());
    }
    // Empty password field = keep the existing one
    if (typeof body.smtp_pass === 'string' && body.smtp_pass !== '') {
      upsert.run('smtp_pass', body.smtp_pass);
    }
  })();
  res.json({ success: true });
});

router.post('/smtp/test', requireAdmin, async (req: Request, res: Response) => {
  const { to } = req.body as { to?: string };
  if (!to?.trim()) return res.status(400).json({ error: 'A destination email address is required' });
  if (!isSmtpConfigured()) return res.status(503).json({ error: 'SMTP is not configured — set at least Host and From address' });
  try {
    await sendMail({
      to: to.trim(),
      subject: 'Packaging Configurator — SMTP test',
      text: 'This is a test email from the Packaging Configurator. Your SMTP configuration works.',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'SMTP send failed' });
  }
});

export default router;
