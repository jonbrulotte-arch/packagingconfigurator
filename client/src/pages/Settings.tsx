import { useState, useEffect } from 'react';
import { Settings, BackupEntry } from '../types';
import { getSettings, updateSettings, setPassword, removePassword, listBackups, createBackup, downloadBackup, restoreBackup, deleteBackup, deleteAllProducts, deleteAllPackaging } from '../api';
import { useAuth } from '../contexts/AuthContext';

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
}));

function BackupSection() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [schedule, setSchedule] = useState({ frequency: 'daily', hour: '2', max_count: '7' });
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState('');

  useEffect(() => {
    getSettings().then(s => {
      setSchedule({
        frequency: s.backup_frequency ?? 'daily',
        hour: s.backup_hour ?? '2',
        max_count: s.backup_max_count ?? '7',
      });
    }).finally(() => setScheduleLoading(false));
  }, []);

  const handleSaveSchedule = async () => {
    setScheduleSaving(true);
    setScheduleMsg('');
    try {
      await updateSettings({
        backup_frequency: schedule.frequency,
        backup_hour: schedule.hour,
        backup_max_count: schedule.max_count,
      } as Settings);
      setScheduleMsg('Schedule saved.');
      setTimeout(() => setScheduleMsg(''), 3000);
    } finally {
      setScheduleSaving(false);
    }
  };

  const load = async () => {
    try {
      setBackups(await listBackups());
    } catch {
      setErr('Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setCreating(true); setMsg(''); setErr('');
    try {
      await createBackup();
      setMsg('Backup created.');
      setTimeout(() => setMsg(''), 3000);
      load();
    } catch {
      setErr('Backup failed');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (filename: string) => {
    if (!confirm(`Restore database from "${filename}"?\n\nThis will replace ALL current data (products, packaging, shipping methods, settings) with the backup and restart the server.`)) return;
    setMsg(''); setErr('');
    try {
      const result = await restoreBackup(filename);
      setMsg(result.message + ' Page will reload shortly.');
      setTimeout(() => window.location.reload(), 3000);
    } catch {
      setErr('Restore failed');
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Delete backup "${filename}"?`)) return;
    setMsg(''); setErr('');
    try {
      await deleteBackup(filename);
      load();
    } catch {
      setErr('Delete failed');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Database Backups</h2>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create Backup Now'}
        </button>
      </div>

      {/* Schedule settings */}
      <div className="mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Auto-Backup Schedule</h3>
        {scheduleLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
                <select
                  value={schedule.frequency}
                  onChange={e => setSchedule(s => ({ ...s, frequency: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hour</label>
                <select
                  value={schedule.hour}
                  onChange={e => setSchedule(s => ({ ...s, hour: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  {HOURS.map(h => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Backups to Keep</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={schedule.max_count}
                  onChange={e => setSchedule(s => ({ ...s, max_count: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveSchedule}
                disabled={scheduleSaving}
                className="px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50"
              >
                {scheduleSaving ? 'Saving…' : 'Save Schedule'}
              </button>
              {scheduleMsg && <span className="text-sm text-green-700">{scheduleMsg}</span>}
            </div>
            <p className="text-xs text-gray-400">
              Oldest auto-backups are removed when the limit is reached. Manual backups are not automatically pruned.
            </p>
          </div>
        )}
      </div>

      {msg && <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">{msg}</div>}
      {err && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">{err}</div>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : backups.length === 0 ? (
        <p className="text-sm text-gray-400">No backups yet. Click "Create Backup Now" to make one.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded overflow-hidden">
          {backups.map(b => (
            <div key={b.filename} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs text-gray-700 truncate">{b.filename}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(b.created_at)} · {formatSize(b.size)}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => downloadBackup(b.filename)}
                  className="text-xs px-2.5 py-1 border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
                >
                  Download
                </button>
                <button
                  onClick={() => handleRestore(b.filename)}
                  className="text-xs px-2.5 py-1 border border-amber-300 rounded hover:bg-amber-50 text-amber-700 font-medium"
                >
                  Restore
                </button>
                <button
                  onClick={() => handleDelete(b.filename)}
                  className="text-xs px-2.5 py-1 border border-red-200 rounded hover:bg-red-50 text-red-500"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PasswordSection() {
  const { isProtected, refresh } = useAuth();
  const [mode, setMode] = useState<'idle' | 'set' | 'change' | 'remove'>('idle');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setMode('idle'); setCurrent(''); setNext(''); setConfirm(''); setMsg(''); setErr(''); };

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { setErr('Passwords do not match'); return; }
    setSaving(true); setErr('');
    const result = await setPassword(next, isProtected ? current : undefined);
    setSaving(false);
    if (result.success) {
      setMsg(isProtected ? 'Password changed.' : 'Admin password set.');
      await refresh();
      setTimeout(reset, 2000);
    } else {
      setErr(result.error ?? 'Failed');
    }
  };

  const handleRemove = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setErr('');
    const result = await removePassword(current);
    setSaving(false);
    if (result.success) {
      setMsg('Password removed. Admin pages are now open.');
      await refresh();
      setTimeout(reset, 2000);
    } else {
      setErr(result.error ?? 'Failed');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Admin Password</h2>
      <p className="text-sm text-gray-500 mb-4">
        {isProtected
          ? 'Admin pages (Products, Packaging, Settings) are password-protected.'
          : 'No password is set — admin pages are open to anyone.'}
      </p>

      {msg && <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">{msg}</div>}
      {err && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">{err}</div>}

      {mode === 'idle' && (
        <div className="flex gap-2">
          {!isProtected && (
            <button onClick={() => setMode('set')} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700">
              Set Password
            </button>
          )}
          {isProtected && (
            <>
              <button onClick={() => setMode('change')} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700">
                Change Password
              </button>
              <button onClick={() => setMode('remove')} className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50">
                Remove Password
              </button>
            </>
          )}
        </div>
      )}

      {(mode === 'set' || mode === 'change') && (
        <form onSubmit={handleSet} className="space-y-3 max-w-xs">
          {mode === 'change' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" required />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
            <input type="password" value={next} onChange={e => setNext(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" minLength={4} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" required />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Saving…' : mode === 'change' ? 'Change Password' : 'Set Password'}
            </button>
            <button type="button" onClick={reset} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === 'remove' && (
        <form onSubmit={handleRemove} className="space-y-3 max-w-xs">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" required />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50">
              {saving ? 'Removing…' : 'Remove Password'}
            </button>
            <button type="button" onClick={reset} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    dim_divisor: '139',
    pack_efficiency: '0.70',
    weight_unit: 'lbs',
    dim_unit: 'in',
    ltl_threshold: '150',
    fit_clearance: '0.5',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      setSettings(await updateSettings(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-400 py-8">Loading…</div>;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-sm text-gray-500">Configure how package recommendations are calculated.</p>
      </div>

      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{error}</div>}
      {saved && <div className="px-4 py-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">Settings saved.</div>}

      <form onSubmit={handleSave} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dimensional Weight Divisor
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={settings.dim_divisor}
            onChange={e => setSettings(s => ({ ...s, dim_divisor: e.target.value }))}
            className="w-40 border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Standard values: 139 (UPS/FedEx domestic, inches) · 166 (USPS) · 5000 (international, cm).
            Formula: <code>Box Volume / Divisor = Dim Weight</code>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Multi-Product Packing Efficiency
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0.1"
              max="1.0"
              step="0.05"
              value={settings.pack_efficiency}
              onChange={e => setSettings(s => ({ ...s, pack_efficiency: e.target.value }))}
              className="w-28 border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <span className="text-sm text-gray-500">
              ({Math.round(Number(settings.pack_efficiency) * 100)}% fill)
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            For multiple products, the combined volume must fit within this fraction of the box volume.
            0.70 (70%) is a practical default for irregular shapes.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            LTL Freight Threshold (lbs)
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={settings.ltl_threshold}
            onChange={e => setSettings(s => ({ ...s, ltl_threshold: e.target.value }))}
            className="w-40 border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Shipments at or above this weight are flagged as LTL Freight. Standard industry threshold is 150 lbs.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Minimum Fit Clearance (in)
          </label>
          <input
            type="number"
            min="0"
            step="0.25"
            value={settings.fit_clearance}
            onChange={e => setSettings(s => ({ ...s, fit_clearance: e.target.value }))}
            className="w-40 border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Minimum breathing room required between item and box in every dimension. A product that exactly matches
            a box dimension won't be considered a fit. 0.5" is a practical default; set to 0 to disable.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weight Unit (display only)</label>
            <input
              value={settings.weight_unit}
              onChange={e => setSettings(s => ({ ...s, weight_unit: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dimension Unit (display only)</label>
            <input
              value={settings.dim_unit}
              onChange={e => setSettings(s => ({ ...s, dim_unit: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>

      <PasswordSection />
      <BackupSection />
      <DangerZoneSection />
    </div>
  );
}

type DangerTarget = 'products' | 'packaging' | null;

function DangerZoneSection() {
  const { isProtected } = useAuth();
  const [active, setActive] = useState<DangerTarget>(null);
  const [password, setPasswordInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ target: DangerTarget; count: number } | null>(null);

  const open = (target: DangerTarget) => {
    setActive(target);
    setPasswordInput('');
    setError('');
    setDone(null);
  };

  const cancel = () => { setActive(null); setError(''); setPasswordInput(''); };

  const confirm = async () => {
    if (!active) return;
    setDeleting(true);
    setError('');
    try {
      const fn = active === 'products' ? deleteAllProducts : deleteAllPackaging;
      const result = await fn(password);
      setDone({ target: active, count: result.deleted });
      setActive(null);
      setPasswordInput('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const items: { target: DangerTarget; label: string; description: string }[] = [
    {
      target: 'products',
      label: 'Delete All Products',
      description: 'Permanently removes every product from the catalog. This cannot be undone.',
    },
    {
      target: 'packaging',
      label: 'Delete All Packaging',
      description: 'Permanently removes every packaging option. This cannot be undone.',
    },
  ];

  return (
    <div className="border border-red-200 rounded-lg overflow-hidden">
      <div className="bg-red-50 px-5 py-3 border-b border-red-200">
        <h2 className="text-sm font-semibold text-red-800 uppercase tracking-wide">Danger Zone</h2>
      </div>

      <div className="divide-y divide-red-100">
        {items.map(({ target, label, description }) => (
          <div key={target} className="bg-white px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </div>
              <button
                onClick={() => open(target)}
                disabled={active !== null}
                className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-red-700 border border-red-300 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {label}
              </button>
            </div>

            {active === target && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-red-800">
                  ⚠ This will permanently delete all {target}. This action cannot be undone.
                </p>
                {isProtected ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Enter admin password to confirm
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPasswordInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !deleting && confirm()}
                      placeholder="Admin password"
                      autoFocus
                      className="w-full max-w-xs border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">No admin password is set. Click confirm to proceed.</p>
                )}
                {error && <p className="text-sm text-red-700 font-medium">{error}</p>}
                <div className="flex items-center gap-3">
                  <button
                    onClick={confirm}
                    disabled={deleting || (isProtected && !password)}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    onClick={cancel}
                    disabled={deleting}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {done?.target === target && (
              <p className="mt-3 text-sm text-green-700 font-medium">
                Deleted {done.count} {target} successfully.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
