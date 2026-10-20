import { useState, useEffect, useRef } from 'react';
import { ShippingMethod } from '../types';
import {
  getShippingMethods, createShippingMethod, updateShippingMethod, deleteShippingMethod,
  getMethodRates, updateMethodRates, importShippingRates, exportShippingRates, downloadRatesTemplate,
} from '../api';
import { useAuth } from '../contexts/AuthContext';

const EMPTY: Omit<ShippingMethod, 'id'> = {
  name: '', min_weight: 0, max_weight: null,
  dim_divisor: null, dim_threshold: null,
  active: 1, is_ltl: 0, notes: null, sort_order: 0,
};

interface FormState {
  name: string;
  min_weight: string;
  max_weight: string;
  dim_divisor: string;
  dim_threshold: string;
  notes: string;
  active: boolean;
  is_ltl: boolean;
}

function toForm(m?: ShippingMethod): FormState {
  return {
    name: m?.name ?? '',
    min_weight: m != null ? String(m.min_weight) : '0',
    max_weight: m?.max_weight != null ? String(m.max_weight) : '',
    dim_divisor: m?.dim_divisor != null ? String(m.dim_divisor) : '',
    dim_threshold: m?.dim_threshold != null ? String(m.dim_threshold) : '',
    notes: m?.notes ?? '',
    active: m ? Boolean(m.active) : true,
    is_ltl: m ? Boolean(m.is_ltl) : false,
  };
}

function fromForm(f: FormState, existing?: ShippingMethod): Omit<ShippingMethod, 'id'> {
  return {
    name: f.name.trim(),
    min_weight: f.min_weight !== '' ? Number(f.min_weight) : 0,
    max_weight: f.max_weight !== '' ? Number(f.max_weight) : null,
    dim_divisor: f.is_ltl ? null : (f.dim_divisor !== '' ? Number(f.dim_divisor) : null),
    dim_threshold: f.is_ltl ? null : (f.dim_threshold !== '' ? Number(f.dim_threshold) : null),
    active: f.active ? 1 : 0,
    is_ltl: f.is_ltl ? 1 : 0,
    notes: f.notes.trim() || null,
    sort_order: existing?.sort_order ?? 0,
  };
}

function MethodForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial?: ShippingMethod;
  onSave: (data: Omit<ShippingMethod, 'id'>) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const set = (k: keyof FormState, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(fromForm(form, initial));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-5 mb-4 border-l-4 border-l-brand-400">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">
        {initial ? 'Edit Shipping Method' : 'Add Shipping Method'}
      </h3>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Service Name <span className="text-red-500">*</span>
          </label>
          <input
            value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder="e.g. USPS First Class, UPS Ground, FedEx Home Delivery"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Min Weight (lbs)</label>
          <input
            type="number" min="0" step="any" value={form.min_weight}
            onChange={e => set('min_weight', e.target.value)}
            placeholder="0"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">Inclusive lower bound. Usually 0.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Max Weight (lbs)</label>
          <input
            type="number" min="0" step="any" value={form.max_weight}
            onChange={e => set('max_weight', e.target.value)}
            placeholder="e.g. 70 — blank = no limit"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">Inclusive upper bound. Blank = no upper limit.</p>
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1 ${form.is_ltl ? 'text-gray-400' : 'text-gray-600'}`}>DIM Divisor</label>
          <input
            type="number" min="1" step="any" value={form.dim_divisor}
            onChange={e => set('dim_divisor', e.target.value)}
            disabled={form.is_ltl}
            placeholder={form.is_ltl ? 'N/A — LTL does not use DIM' : 'Blank = use global setting'}
            className={`w-full border rounded px-3 py-2 text-sm ${form.is_ltl ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' : 'border-gray-300'}`}
          />
          <p className="mt-1 text-xs text-gray-400">139 UPS/FedEx · 166 USPS</p>
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1 ${form.is_ltl ? 'text-gray-400' : 'text-gray-600'}`}>DIM Volume Threshold (in³)</label>
          <input
            type="number" min="0" step="any" value={form.dim_threshold}
            onChange={e => set('dim_threshold', e.target.value)}
            disabled={form.is_ltl}
            placeholder={form.is_ltl ? 'N/A — LTL does not use DIM' : 'Blank = always apply DIM'}
            className={`w-full border rounded px-3 py-2 text-sm ${form.is_ltl ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' : 'border-gray-300'}`}
          />
          <p className="mt-1 text-xs text-gray-400">1728 = USPS (DIM only if vol &gt; 1 ft³)</p>
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
            type="checkbox" id="sm-active" checked={form.active}
            onChange={e => set('active', e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="sm-active" className="text-sm text-gray-700">Active</label>
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox" id="sm-is-ltl" checked={form.is_ltl}
            onChange={e => set('is_ltl', e.target.checked)}
            className="rounded border-gray-300 mt-0.5"
          />
          <div>
            <label htmlFor="sm-is-ltl" className="text-sm text-gray-700 font-medium">LTL Freight method</label>
            <p className="text-xs text-gray-400 mt-0.5">Billed by actual weight only — DIM never applies. The configurator uses this method only when the shipment weight exceeds the LTL threshold.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving || !form.name.trim()}
          className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : initial ? 'Update' : 'Add Method'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

interface RateRow {
  max_weight: string;
  rate: string;
}

function RateCardPanel({ methodId, canEdit }: { methodId: number; canEdit: boolean }) {
  const [rows, setRows] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    getMethodRates(methodId)
      .then(rates => setRows(rates.map(r => ({ max_weight: String(r.max_weight), rate: String(r.rate) }))))
      .catch(() => setErr('Failed to load rate card'))
      .finally(() => setLoading(false));
  }, [methodId]);

  const update = (i: number, field: keyof RateRow, value: string) =>
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const addRow = () => setRows(rs => [...rs, { max_weight: '', rate: '' }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const save = async () => {
    setMsg(''); setErr('');
    const cleaned: { max_weight: number; rate: number }[] = [];
    const seen = new Set<number>();
    for (const r of rows) {
      if (r.max_weight === '' && r.rate === '') continue; // skip blank rows
      const maxWeight = Number(r.max_weight);
      const rate = Number(r.rate);
      if (isNaN(maxWeight) || maxWeight <= 0) { setErr('Each break needs a weight greater than 0'); return; }
      if (isNaN(rate) || rate < 0) { setErr('Each break needs a rate of 0 or more'); return; }
      if (seen.has(maxWeight)) { setErr(`Duplicate weight break: ${maxWeight} lbs`); return; }
      seen.add(maxWeight);
      cleaned.push({ max_weight: maxWeight, rate });
    }
    cleaned.sort((a, b) => a.max_weight - b.max_weight);
    setSaving(true);
    try {
      const saved = await updateMethodRates(methodId, cleaned);
      setRows(saved.map(r => ({ max_weight: String(r.max_weight), rate: String(r.rate) })));
      setMsg('Rate card saved.');
      setTimeout(() => setMsg(''), 2500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">Loading rate card…</div>;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase">Rate Card — single zone, by billed weight</p>
        {msg && <span className="text-xs text-green-700">{msg}</span>}
      </div>
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

      {rows.length === 0 && !canEdit ? (
        <p className="text-xs text-gray-400">No rates configured for this method.</p>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[130px_110px_32px] gap-2 text-[11px] font-medium text-gray-400 uppercase tracking-wide px-1">
            <span>Up to (lbs)</span>
            <span>Rate ($)</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[130px_110px_32px] gap-2 items-center">
              <input
                type="number" min="0" step="any" value={r.max_weight}
                onChange={e => update(i, 'max_weight', e.target.value)}
                disabled={!canEdit}
                className="border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-500"
              />
              <input
                type="number" min="0" step="0.01" value={r.rate}
                onChange={e => update(i, 'rate', e.target.value)}
                disabled={!canEdit}
                className="border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-500"
              />
              {canEdit && (
                <button onClick={() => removeRow(i)} title="Remove break"
                  className="flex items-center justify-center h-7 w-7 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-3 mt-2">
          <button onClick={addRow} className="text-xs text-brand-600 hover:text-brand-800">+ Add break</button>
          <button onClick={save} disabled={saving}
            className="px-3 py-1 text-xs font-medium bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Rates'}
          </button>
        </div>
      )}
    </div>
  );
}

function MethodRow({
  method,
  onEdit,
  onDelete,
  onToggle,
  canEdit,
}: {
  method: ShippingMethod;
  onEdit: (m: ShippingMethod) => void;
  onDelete: (id: number) => void;
  onToggle: (m: ShippingMethod) => void;
  canEdit: boolean;
}) {
  const weightRange = method.max_weight != null
    ? `${method.min_weight} – ${method.max_weight} lbs`
    : `${method.min_weight}+ lbs`;
  const [showRates, setShowRates] = useState(false);

  return (
    <div className={`bg-white rounded-lg shadow border-l-4 ${method.active ? 'border-l-green-400' : 'border-l-gray-200'} px-5 py-3`}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold ${method.active ? 'text-gray-900' : 'text-gray-400'}`}>
              {method.name}
            </span>
            {!method.active && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Inactive</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-1">
            <span className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded">
              {weightRange}
            </span>
            {method.is_ltl ? (
              <span className="text-xs px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-700 rounded font-medium">LTL Freight — no DIM</span>
            ) : (
              <>
                {method.dim_divisor != null
                  ? <span className="text-xs px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded">DIM ÷{method.dim_divisor}</span>
                  : <span className="text-xs text-gray-400">DIM ÷global</span>
                }
                {method.dim_threshold != null
                  ? <span className="text-xs px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded">
                      Vol &gt; {method.dim_threshold.toLocaleString()} in³ for DIM
                    </span>
                  : <span className="text-xs text-gray-400">DIM always applies</span>
                }
              </>
            )}
            {method.notes && (
              <span className="text-xs text-gray-400 truncate max-w-xs">{method.notes}</span>
            )}
            <button
              onClick={() => setShowRates(s => !s)}
              className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                showRates
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
              }`}
            >
              {showRates ? 'Hide Rates' : '$ Rates'}
            </button>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onToggle(method)}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                method.active
                  ? 'text-green-700 border-green-300 bg-green-50 hover:bg-green-100'
                  : 'text-gray-500 border-gray-300 bg-gray-50 hover:bg-gray-100'
              }`}
              title={method.active ? 'Click to deactivate' : 'Click to activate'}
            >
              {method.active ? '● Active' : '○ Inactive'}
            </button>
            <button onClick={() => onEdit(method)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Edit">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => onDelete(method.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              title="Delete">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {showRates && <RateCardPanel methodId={method.id} canEdit={canEdit} />}
    </div>
  );
}

export default function ShippingMethodsPage() {
  const { authenticated } = useAuth();
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ShippingMethod | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [ratesMsg, setRatesMsg] = useState('');
  const [ratesErrors, setRatesErrors] = useState<string[]>([]);
  const ratesFileRef = useRef<HTMLInputElement>(null);

  const handleRatesImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRatesMsg('');
    setRatesErrors([]);
    try {
      const result = await importShippingRates(file);
      setRatesMsg(`Imported ${result.imported} rate break${result.imported !== 1 ? 's' : ''} across ${result.methods_updated} method${result.methods_updated !== 1 ? 's' : ''}.`);
      if (result.errors.length > 0) setRatesErrors(result.errors);
    } catch (err: unknown) {
      setRatesErrors([err instanceof Error ? err.message : 'Import failed']);
    } finally {
      if (ratesFileRef.current) ratesFileRef.current.value = '';
    }
  };

  useEffect(() => {
    getShippingMethods()
      .then(setMethods)
      .catch(() => setError('Failed to load shipping methods'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (data: Omit<ShippingMethod, 'id'>) => {
    setSaving(true); setFormError('');
    try {
      if (editing) {
        const updated = await updateShippingMethod(editing.id, data);
        setMethods(ms => ms.map(m => m.id === editing.id ? updated : m));
        setEditing(null);
      } else {
        const created = await createShippingMethod(data);
        setMethods(ms => [...ms, created]);
        setShowForm(false);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this shipping method?')) return;
    try {
      await deleteShippingMethod(id);
      setMethods(ms => ms.filter(m => m.id !== id));
    } catch {
      setError('Failed to delete');
    }
  };

  const handleToggle = async (method: ShippingMethod) => {
    const updated = await updateShippingMethod(method.id, { ...method, active: method.active ? 0 : 1 });
    setMethods(ms => ms.map(m => m.id === method.id ? updated : m));
  };

  const cancelForm = () => { setShowForm(false); setEditing(null); setFormError(''); };

  if (loading) return <div className="text-gray-400 py-8">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shipping Methods</h1>
          <p className="text-sm text-gray-500 mt-1">
            Each method is a discrete shipping service with a weight range. When the configurator
            evaluates a packaging option, it shows every method whose weight range covers the
            carrier-specific billed weight.
          </p>
        </div>
        {authenticated && !showForm && !editing && (
          <button
            onClick={() => setShowForm(true)}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Method
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={downloadRatesTemplate}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
        >
          Rates Template
        </button>
        <button
          onClick={exportShippingRates}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
        >
          Export Rates
        </button>
        {authenticated && (
          <label className="cursor-pointer px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
            Import Rates
            <input ref={ratesFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleRatesImport} className="hidden" />
          </label>
        )}
        <span className="text-xs text-gray-400">Rate cards: one row per weight break — Method Name, Up To Weight (lbs), Rate ($).</span>
      </div>

      {ratesMsg && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">{ratesMsg}</div>
      )}
      {ratesErrors.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded">
          <p className="text-xs font-medium text-amber-800 mb-1">Some rate rows were skipped:</p>
          <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
            {ratesErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{error}</div>}

      {authenticated && (showForm || editing) && (
        <MethodForm
          initial={editing ?? undefined}
          onSave={handleSave}
          onCancel={cancelForm}
          saving={saving}
          error={formError}
        />
      )}

      {methods.length === 0 && !showForm ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm mb-2">No shipping methods configured yet.</p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Example: add "USPS First Class" with a weight range of 0–0.8125 lbs,
            or "UPS Ground" with 0–150 lbs. The configurator will show matching
            methods on every packaging recommendation.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {methods.map(m => (
            <MethodRow
              key={m.id}
              method={m}
              onEdit={m => { setEditing(m); setShowForm(false); setFormError(''); }}
              onDelete={handleDelete}
              onToggle={handleToggle}
              canEdit={authenticated}
            />
          ))}
        </div>
      )}

      {methods.length > 0 && (
        <div className="mt-5 text-xs text-gray-400 space-y-1.5">
          <p><strong>Weight range:</strong> The carrier-specific billed weight must fall between Min and Max (inclusive) for this method to appear on a result.</p>
          <p><strong>DIM Divisor:</strong> Override the global DIM divisor for this carrier. Leave blank to inherit the global setting from the Settings page.</p>
          <p><strong>DIM Volume Threshold:</strong> DIM weight only applies when the package volume exceeds this value. Set to <strong>1728</strong> for USPS (DIM kicks in only when volume &gt; 1 ft³). Leave blank for carriers that always apply DIM (UPS, FedEx).</p>
          <p><strong>LTL Freight:</strong> Mark a method as LTL to exclude it from DIM calculations entirely. LTL methods are matched by actual shipment weight only and only appear when the total shipment weight exceeds the LTL threshold set in Settings.</p>
          <p><strong>Rate Card:</strong> Click "$ Rates" on a method to manage its single-zone, by-weight rate card. Each break reads "up to X lbs → $rate"; the configurator looks up the billed weight against these breaks and highlights the cheapest matching method as Recommended. Use Import/Export above to manage rate cards in Excel.</p>
        </div>
      )}
    </div>
  );
}
