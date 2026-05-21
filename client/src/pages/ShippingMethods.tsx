import { useState, useEffect } from 'react';
import { ShippingMethod, ShippingRate } from '../types';
import {
  getShippingMethods, createShippingMethod, updateShippingMethod, deleteShippingMethod,
  addShippingRate, deleteShippingRate,
} from '../api';

const EMPTY_FORM = { name: '', dim_divisor: '', dim_threshold: '', notes: '', active: true };

function MethodForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial?: ShippingMethod;
  onSave: (data: Omit<ShippingMethod, 'id' | 'rates'>) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    dim_divisor: initial?.dim_divisor != null ? String(initial.dim_divisor) : '',
    dim_threshold: initial?.dim_threshold != null ? String(initial.dim_threshold) : '',
    notes: initial?.notes ?? '',
    active: initial ? Boolean(initial.active) : true,
  });

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: form.name.trim(),
      dim_divisor: form.dim_divisor !== '' ? Number(form.dim_divisor) : null,
      dim_threshold: form.dim_threshold !== '' ? Number(form.dim_threshold) : null,
      notes: form.notes.trim() || null,
      active: form.active ? 1 : 0,
      sort_order: initial?.sort_order ?? 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-5 mb-4 border-l-4 border-l-brand-400">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">{initial ? 'Edit Method' : 'Add Shipping Method'}</h3>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
          <input
            value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder="e.g. USPS, UPS Ground, FedEx"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">DIM Divisor</label>
          <input
            type="number" min="1" step="any" value={form.dim_divisor}
            onChange={e => set('dim_divisor', e.target.value)}
            placeholder="Blank = use global"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">Standard: 139 UPS/FedEx · 166 USPS</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">DIM Volume Threshold (in³)</label>
          <input
            type="number" min="0" step="any" value={form.dim_threshold}
            onChange={e => set('dim_threshold', e.target.value)}
            placeholder="Blank = always apply DIM"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">USPS = 1728 (DIM only if vol &gt; 1 ft³)</p>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <input
            value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Optional notes"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox" id="method-active" checked={form.active}
            onChange={e => set('active', e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="method-active" className="text-sm text-gray-700">Active</label>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : initial ? 'Update Method' : 'Add Method'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RateRow({ rate, onDelete }: { rate: ShippingRate; onDelete: (id: number) => void }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0 group">
      <span className="text-xs text-gray-400 w-24 flex-shrink-0 font-mono">≤ {rate.max_weight} lbs</span>
      <span className="text-sm text-gray-700 flex-1">{rate.label}</span>
      <button
        onClick={() => onDelete(rate.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
        title="Remove tier"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function AddRateForm({ methodId, onAdd }: { methodId: number; onAdd: (rate: ShippingRate) => void }) {
  const [label, setLabel] = useState('');
  const [maxWeight, setMaxWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !maxWeight) return;
    setSaving(true); setError('');
    try {
      const rate = await addShippingRate(methodId, { max_weight: Number(maxWeight), label: label.trim() });
      onAdd(rate);
      setLabel(''); setMaxWeight('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add tier');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-2 pt-2 border-t border-gray-100">
      <div className="w-28">
        <label className="block text-xs text-gray-400 mb-1">Max Wt (lbs)</label>
        <input
          type="number" min="0.01" step="any" value={maxWeight}
          onChange={e => setMaxWeight(e.target.value)} required
          placeholder="e.g. 1"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs text-gray-400 mb-1">Service Name</label>
        <input
          value={label} onChange={e => setLabel(e.target.value)} required
          placeholder="e.g. Priority Mail"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        />
      </div>
      <button type="submit" disabled={saving}
        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50 mb-0.5">
        {saving ? '…' : '+ Add'}
      </button>
      {error && <p className="text-xs text-red-600 self-end mb-1">{error}</p>}
    </form>
  );
}

function MethodCard({
  method,
  onEdit,
  onDelete,
  onRateAdded,
  onRateDeleted,
}: {
  method: ShippingMethod;
  onEdit: (m: ShippingMethod) => void;
  onDelete: (id: number) => void;
  onRateAdded: (methodId: number, rate: ShippingRate) => void;
  onRateDeleted: (methodId: number, rateId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deletingRate, setDeletingRate] = useState<number | null>(null);

  const handleDeleteRate = async (rateId: number) => {
    setDeletingRate(rateId);
    try {
      await deleteShippingRate(rateId);
      onRateDeleted(method.id, rateId);
    } catch { /* ignore */ } finally {
      setDeletingRate(null);
    }
  };

  const sortedRates = [...method.rates].sort((a, b) => a.max_weight - b.max_weight);

  return (
    <div className={`bg-white rounded-lg shadow border-l-4 ${method.active ? 'border-l-green-400' : 'border-l-gray-200'}`}>
      <div className="px-5 py-3 flex items-center gap-3">
        <button onClick={() => setExpanded(e => !e)} className="flex-1 flex items-center gap-3 text-left min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{method.name}</span>
              {!method.active && <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Inactive</span>}
              {method.dim_divisor != null
                ? <span className="text-xs px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded font-mono">DIM ÷{method.dim_divisor}</span>
                : <span className="text-xs text-gray-400">DIM ÷global</span>
              }
              {method.dim_threshold != null
                ? <span className="text-xs px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded">
                    Vol &gt; {method.dim_threshold.toLocaleString()} in³ for DIM
                  </span>
                : <span className="text-xs text-gray-400">DIM always</span>
              }
              <span className="text-xs text-gray-400">{sortedRates.length} tier{sortedRates.length !== 1 ? 's' : ''}</span>
            </div>
            {method.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{method.notes}</p>}
          </div>
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button onClick={() => onEdit(method)}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
          title="Edit method">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button onClick={() => onDelete(method.id)}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
          title="Delete method">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Weight Tiers</p>
          {sortedRates.length === 0
            ? <p className="text-sm text-gray-400 italic">No tiers configured. Add tiers below.</p>
            : sortedRates.map(r => (
                <RateRow
                  key={r.id}
                  rate={deletingRate === r.id ? { ...r, label: 'Removing…' } : r}
                  onDelete={handleDeleteRate}
                />
              ))
          }
          <AddRateForm
            methodId={method.id}
            onAdd={rate => onRateAdded(method.id, rate)}
          />
          <p className="mt-2 text-xs text-gray-400">
            The first tier whose max weight ≥ billed weight is selected. Tiers are matched in ascending order.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ShippingMethodsPage() {
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMethod, setEditingMethod] = useState<ShippingMethod | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    getShippingMethods()
      .then(setMethods)
      .catch(() => setError('Failed to load shipping methods'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (data: Omit<ShippingMethod, 'id' | 'rates'>) => {
    setFormSaving(true); setFormError('');
    try {
      if (editingMethod) {
        const updated = await updateShippingMethod(editingMethod.id, data) as ShippingMethod & { rates: ShippingRate[] };
        setMethods(ms => ms.map(m => m.id === editingMethod.id ? { ...updated, rates: editingMethod.rates } : m));
        setEditingMethod(null);
      } else {
        const created = await createShippingMethod(data) as ShippingMethod & { rates: ShippingRate[] };
        setMethods(ms => [...ms, { ...created, rates: created.rates ?? [] }]);
        setShowAddForm(false);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this shipping method and all its weight tiers?')) return;
    try {
      await deleteShippingMethod(id);
      setMethods(ms => ms.filter(m => m.id !== id));
    } catch {
      setError('Failed to delete method');
    }
  };

  const handleRateAdded = (methodId: number, rate: ShippingRate) => {
    setMethods(ms => ms.map(m => m.id === methodId ? { ...m, rates: [...m.rates, rate] } : m));
  };

  const handleRateDeleted = (methodId: number, rateId: number) => {
    setMethods(ms => ms.map(m => m.id === methodId ? { ...m, rates: m.rates.filter(r => r.id !== rateId) } : m));
  };

  if (loading) return <div className="text-gray-400 py-8">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shipping Methods</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure carriers with their own DIM rules and weight tiers. The configurator
            will recommend the matching service for each packaging option.
          </p>
        </div>
        {!showAddForm && !editingMethod && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Method
          </button>
        )}
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{error}</div>}

      {(showAddForm || editingMethod) && (
        <MethodForm
          initial={editingMethod ?? undefined}
          onSave={handleSave}
          onCancel={() => { setShowAddForm(false); setEditingMethod(null); setFormError(''); }}
          saving={formSaving}
          error={formError}
        />
      )}

      {methods.length === 0 && !showAddForm ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm mb-3">No shipping methods configured yet.</p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Add carriers like USPS, UPS, or FedEx with their DIM rules and weight tiers.
            The configurator will show which service applies to each packaging option.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {methods.map(method => (
            <MethodCard
              key={method.id}
              method={method}
              onEdit={m => { setEditingMethod(m); setShowAddForm(false); setFormError(''); }}
              onDelete={handleDelete}
              onRateAdded={handleRateAdded}
              onRateDeleted={handleRateDeleted}
            />
          ))}
        </div>
      )}

      {methods.length > 0 && (
        <div className="mt-4 text-xs text-gray-400 space-y-1">
          <p><strong>DIM Divisor:</strong> Override the global divisor for this carrier. Leave blank to use the global setting (currently configured in Settings).</p>
          <p><strong>DIM Volume Threshold:</strong> DIM weight only applies when the package volume exceeds this value. USPS uses 1,728 in³ (1 cubic foot). Leave blank for carriers that always apply DIM (UPS, FedEx).</p>
        </div>
      )}
    </div>
  );
}
