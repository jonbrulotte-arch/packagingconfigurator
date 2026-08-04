import nodemailer from 'nodemailer';
import db from './db';

function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function isSmtpConfigured(): boolean {
  const s = getSettings();
  return Boolean(s.smtp_host && s.smtp_from);
}

function getTransport() {
  const s = getSettings();
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: Number(s.smtp_port || 587),
    secure: s.smtp_secure === '1',
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass ?? '' } : undefined,
  });
}

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }) {
  const s = getSettings();
  const transport = getTransport();
  await transport.sendMail({
    from: s.smtp_from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

// app_base_url is admin-configured — the server can't reliably know its public address.
function buildLink(path: string): string {
  const s = getSettings();
  const base = (s.app_base_url ?? '').replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

export async function sendInviteEmail(email: string, name: string | null, rawToken: string) {
  const link = buildLink(`/accept-invite?token=${rawToken}`);
  const greeting = name ? `Hi ${name},` : 'Hi,';
  await sendMail({
    to: email,
    subject: 'You have been invited to the Packaging Configurator',
    text: `${greeting}\n\nAn administrator invited you to the Packaging Configurator.\n\nSet your password and activate your account here (link valid for 7 days):\n${link}\n\nIf you were not expecting this invitation you can ignore this email.`,
    html: `<p>${greeting}</p><p>An administrator invited you to the <strong>Packaging Configurator</strong>.</p><p><a href="${link}">Set your password and activate your account</a> (link valid for 7 days).</p><p style="color:#888;font-size:12px">If you were not expecting this invitation you can ignore this email.</p>`,
  });
}

export async function sendResetEmail(email: string, name: string | null, rawToken: string) {
  const link = buildLink(`/reset-password?token=${rawToken}`);
  const greeting = name ? `Hi ${name},` : 'Hi,';
  await sendMail({
    to: email,
    subject: 'Packaging Configurator password reset',
    text: `${greeting}\n\nA password reset was requested for your account.\n\nReset your password here (link valid for 1 hour):\n${link}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>${greeting}</p><p>A password reset was requested for your account.</p><p><a href="${link}">Reset your password</a> (link valid for 1 hour).</p><p style="color:#888;font-size:12px">If you did not request this, you can safely ignore this email.</p>`,
  });
}
