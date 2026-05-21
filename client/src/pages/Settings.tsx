import { useState, useEffect } from 'react';
import { Settings } from '../types';
import { getSettings, updateSettings } from '../api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    dim_divisor: '139',
    pack_efficiency: '0.70',
    weight_unit: 'lbs',
    dim_unit: 'in',
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
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">Configure how package recommendations are calculated.</p>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{error}</div>}
      {saved && <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">Settings saved.</div>}

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
    </div>
  );
}
