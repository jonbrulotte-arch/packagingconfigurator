import { useState, useEffect } from 'react';
import { Settings, BackupEntry } from '../types';
import { getSettings, updateSettings, setPassword, removePassword, listBackups, createBackup, downloadBackup, restoreBackup, deleteBackup } from '../api';
import { useAuth } from '../contexts/AuthContext';

function BackupSection() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

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
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-gray-900">Database Backups</h2>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create Backup Now'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Backups are created automatically every 6 hours. A safety copy is saved before any restore.
      </p>

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
    </div>
  );
}
