import { useState, useEffect, useRef } from 'react';
import { SalesChannel, ChannelAllocation, ProductPricingEntry, RoiRow, RoiStatus } from '../types';
import {
  getSalesChannels, createSalesChannel, updateSalesChannel, deleteSalesChannel,
  getProductPricing, setProductPricing, downloadPricingTemplate, exportProductPricing, importProductPricing,
  getRoi, downloadRoiExport,
} from '../api';
import { useAuth } from '../contexts/AuthContext';

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: 'green' | 'red' | 'amber' | 'blue' | 'gray';
}) {
  const colors = {
    green: 'border-t-4 border-green-500',
    red: 'border-t-4 border-red-500',
    amber: 'border-t-4 border-amber-400',
    blue: 'border-t-4 border-brand-500',
    gray: 'border-t-4 border-gray-300',
  };
  return (
    <div className={`bg-white rounded-lg shadow p-5 ${color ? colors[color] : ''}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

const EMPTY_CHANNEL: Omit<SalesChannel, 'id'> = {
  name: '', shipping_terms: 'prepaid', payment_terms: '', transaction_fee: 0,
  min_margin_pct: 0, notes: '', active: 1, allocations: [],
};

function ChannelForm({ initial, onSave, onCancel, saving, error }: {
  initial?: SalesChannel;
  onSave: (data: Omit<SalesChannel, 'id'>) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<Omit<SalesChannel, 'id'>>(() => initial ? { ...initial } : { ...EMPTY_CHANNEL });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const updateAlloc = (i: number, patch: Partial<ChannelAllocation>) =>
    setForm(f => ({ ...f, allocations: f.allocations.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));

  const addAlloc = () => setForm(f => ({ ...f, allocations: [...f.allocations, { label: '', alloc_type: 'fixed', value: 0 }] }));
  const removeAlloc = (i: number) => setForm(f => ({ ...f, allocations: f.allocations.filter((_, idx) => idx !== i) }));

  const percentTotal = form.allocations.filter(a => a.alloc_type === 'percent').reduce((s, a) => s + Number(a.value || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-5 mb-4 border-l-4 border-l-brand-400">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">{initial ? 'Edit Sales Channel' : 'Add Sales Channel'}</h3>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Channel Name <span className="text-red-500">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)} required
            placeholder="e.g. Amazon, D2C Website, Wholesale"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Shipping Terms</label>
          <select value={form.shipping_terms} onChange={e => set('shipping_terms', e.target.value as 'prepaid' | 'collect')}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
            <option value="prepaid">Prepaid (seller pays shipping)</option>
            <option value="collect">Collect (buyer pays shipping)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Terms</label>
          <input value={form.payment_terms ?? ''} onChange={e => set('payment_terms', e.target.value)}
            placeholder="e.g. Net 30, due on receipt"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Per-Transaction Fee ($)</label>
          <input type="number" min="0" step="0.01" value={form.transaction_fee}
            onChange={e => set('transaction_fee', Number(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Minimum Margin %</label>
          <input type="number" min="0" step="0.5" value={form.min_margin_pct}
            onChange={e => set('min_margin_pct', Number(e.target.value))}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-gray-400">Below this — but still profitable — shows yellow. At or below 0% margin always shows red.</p>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input type="checkbox" id="channel-active" checked={Boolean(form.active)}
            onChange={e => set('active', e.target.checked ? 1 : 0)} className="rounded border-gray-300" />
          <label htmlFor="channel-active" className="text-sm text-gray-700">Active</label>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <input value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-gray-600">Cost Allocations</p>
          {percentTotal >= 100 && (
            <span className="text-xs text-amber-600 font-medium">Percent allocations total {percentTotal}% — check this is intended.</span>
          )}
        </div>
        <div className="space-y-2">
          {form.allocations.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_110px_32px] gap-2 items-center">
              <input value={a.label} onChange={e => updateAlloc(i, { label: e.target.value })}
                placeholder="e.g. Referral fee, Fulfillment fee"
                className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <select value={a.alloc_type} onChange={e => updateAlloc(i, { alloc_type: e.target.value as 'fixed' | 'percent' })}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="fixed">$ Fixed</option>
                <option value="percent">% of Retail</option>
              </select>
              <input type="number" step="0.01" value={a.value} onChange={e => updateAlloc(i, { value: Number(e.target.value) })}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
              <button type="button" onClick={() => removeAlloc(i)}
                className="flex items-center justify-center h-8 w-8 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addAlloc} className="mt-2 text-xs text-brand-600 hover:text-brand-800">+ Add allocation</button>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving || !form.name.trim()}
          className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : initial ? 'Update' : 'Add Channel'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ChannelCard({ channel, onEdit, onDelete, canEdit }: {
  channel: SalesChannel; onEdit: () => void; onDelete: () => void; canEdit: boolean;
}) {
  const fixedTotal = channel.allocations.filter(a => a.alloc_type === 'fixed').reduce((s, a) => s + a.value, 0);
  const percentTotal = channel.allocations.filter(a => a.alloc_type === 'percent').reduce((s, a) => s + a.value, 0);
  return (
    <div className={`bg-white rounded-lg shadow border-l-4 ${channel.active ? 'border-l-green-400' : 'border-l-gray-200'} px-5 py-3`}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold ${channel.active ? 'text-gray-900' : 'text-gray-400'}`}>{channel.name}</span>
            {!channel.active && <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Inactive</span>}
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${
              channel.shipping_terms === 'prepaid' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-teal-50 border-teal-200 text-teal-700'
            }`}>
              {channel.shipping_terms === 'prepaid' ? 'Prepaid shipping' : 'Collect shipping'}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-1 text-xs text-gray-500">
            {channel.payment_terms && <span>{channel.payment_terms}</span>}
            <span>Fee: ${channel.transaction_fee.toFixed(2)}/txn</span>
            {fixedTotal > 0 && <span>+${fixedTotal.toFixed(2)} fixed</span>}
            {percentTotal > 0 && <span>+{percentTotal}% of retail</span>}
            <span>Min margin: {channel.min_margin_pct}%</span>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors" title="Edit">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelsSection({ canEdit }: { canEdit: boolean }) {
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesChannel | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => getSalesChannels().then(setChannels).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleSave = async (data: Omit<SalesChannel, 'id'>) => {
    setSaving(true); setFormError('');
    try {
      if (editing) {
        await updateSalesChannel(editing.id, data);
        setEditing(null);
      } else {
        await createSalesChannel(data);
        setShowForm(false);
      }
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (channel: SalesChannel) => {
    if (!confirm(`Delete sales channel "${channel.name}"?`)) return;
    await deleteSalesChannel(channel.id);
    load();
  };

  const cancelForm = () => { setShowForm(false); setEditing(null); setFormError(''); };

  if (loading) return <div className="text-gray-400 py-4">Loading channels…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">Sales Channels</h2>
        {canEdit && !showForm && !editing && (
          <button onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded hover:bg-brand-700">
            + Add Channel
          </button>
        )}
      </div>

      {canEdit && (showForm || editing) && (
        <ChannelForm initial={editing ?? undefined} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} />
      )}

      {channels.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-sm text-gray-400">
          No sales channels yet. {canEdit && 'Add one to start computing margins.'}
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map(c => (
            <ChannelCard key={c.id} channel={c}
              onEdit={() => { setEditing(c); setShowForm(false); setFormError(''); }}
              onDelete={() => handleDelete(c)} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function PricingTable({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<ProductPricingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState('');
  const [editRetail, setEditRetail] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => getProductPricing().then(setRows).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const startEdit = (row: ProductPricingEntry) => {
    setEditingId(row.product_id);
    setEditCost(row.product_cost != null ? String(row.product_cost) : '');
    setEditRetail(row.retail_price != null ? String(row.retail_price) : '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await setProductPricing(editingId, {
      product_cost: editCost === '' ? null : Number(editCost),
      retail_price: editRetail === '' ? null : Number(editRetail),
    });
    setEditingId(null);
    load();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(''); setImportErrors([]);
    try {
      const result = await importProductPricing(file);
      setImportMsg(`Imported ${result.imported} row(s).`);
      if (result.errors.length > 0) setImportErrors(result.errors);
      load();
    } catch (err: unknown) {
      setImportErrors([err instanceof Error ? err.message : 'Import failed']);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const filtered = rows.filter(r =>
    !filter || r.product_id.toLowerCase().includes(filter.toLowerCase()) || r.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-900">Product Pricing</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter products…"
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48" />
          <button onClick={downloadPricingTemplate} className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600">Template</button>
          <button onClick={exportProductPricing} className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600">Export</button>
          {canEdit && (
            <label className="cursor-pointer px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
              Import
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
            </label>
          )}
        </div>
      </div>

      {importMsg && <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">{importMsg}</div>}
      {importErrors.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded">
          <p className="text-xs font-medium text-amber-800 mb-1">Some rows were skipped:</p>
          <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">{importErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Retail</th>
                {canEdit && <th className="px-3 py-2 w-20"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No products found.</td></tr>
              ) : filtered.map(row => (
                <tr key={row.product_id}>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-gray-500">{row.product_id}</span>
                    <span className="ml-2 text-gray-800">{row.name}</span>
                  </td>
                  {editingId === row.product_id ? (
                    <>
                      <td className="px-3 py-2 text-right">
                        <input type="number" step="0.01" value={editCost} onChange={e => setEditCost(e.target.value)}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" step="0.01" value={editRetail} onChange={e => setEditRetail(e.target.value)}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right" />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={saveEdit} className="text-brand-600 hover:text-brand-800 text-xs mr-2">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right font-mono">{row.product_cost != null ? `$${row.product_cost.toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.retail_price != null ? `$${row.retail_price.toFixed(2)}` : '—'}</td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => startEdit(row)} className="text-brand-600 hover:text-brand-800 text-xs">Edit</button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<RoiStatus, { row: string; badge: string; label: string }> = {
  red: { row: 'bg-red-50', badge: 'bg-red-100 text-red-800 border-red-300', label: 'Not Profitable' },
  yellow: { row: 'bg-amber-50', badge: 'bg-amber-100 text-amber-800 border-amber-300', label: 'Below Threshold' },
  ok: { row: '', badge: 'bg-green-100 text-green-800 border-green-300', label: 'Healthy' },
  no_data: { row: '', badge: 'bg-gray-100 text-gray-500 border-gray-300', label: 'No Pricing Data' },
  no_rate: { row: '', badge: 'bg-gray-100 text-gray-500 border-gray-300', label: 'No Shipping Rate' },
};

function RoiSection() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getRoi>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const load = () => {
    setLoading(true); setError('');
    getRoi({ channel_id: channelFilter ? Number(channelFilter) : undefined, status: statusFilter || undefined })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to compute ROI'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [channelFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <div className="text-gray-400 py-4">Computing ROI…</div>;

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-sm text-amber-800">
        {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <StatCard label="Not Profitable" value={data.summary.red} color={data.summary.red > 0 ? 'red' : undefined} />
        <StatCard label="Below Threshold" value={data.summary.yellow} color={data.summary.yellow > 0 ? 'amber' : undefined} />
        <StatCard label="Healthy" value={data.summary.ok} color="green" />
        <StatCard label="No Pricing Data" value={data.summary.no_data} color="gray" />
        <StatCard label="No Shipping Rate" value={data.summary.no_rate} color="gray" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-900">Margin Analysis by Product × Channel</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option value="">All Channels</option>
            {data.channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm">
            <option value="">All Statuses</option>
            <option value="red">Not Profitable</option>
            <option value="yellow">Below Threshold</option>
            <option value="ok">Healthy</option>
            <option value="no_data">No Pricing Data</option>
            <option value="no_rate">No Shipping Rate</option>
          </select>
          <button onClick={downloadRoiExport} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
            Export
          </button>
        </div>
      </div>

      {data.computed_at && (
        <p className="text-xs text-gray-400 mb-2">
          Based on the Packaging Analysis report computed {new Date(data.computed_at).toLocaleString()}.{' '}
          <a href="/reports" className="text-brand-600 hover:underline">Refresh report</a> if the catalog has changed.
        </p>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm whitespace-nowrap">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Retail</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Shipping</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Fees</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Margin %</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No rows match the current filters.</td></tr>
              ) : data.rows.map((row: RoiRow, i: number) => {
                const style = STATUS_STYLES[row.status];
                return (
                  <tr key={`${row.product_id}-${row.channel_id}-${i}`} className={style.row}>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-gray-500">{row.product_id}</span>
                      <span className="ml-2 text-gray-800">{row.name}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.channel_name}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.retail_price != null ? `$${row.retail_price.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.product_cost != null ? `$${row.product_cost.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.shipping_cost != null ? `$${row.shipping_cost.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.fees_total != null ? `$${row.fees_total.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{row.margin != null ? `$${row.margin.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.margin_pct != null ? `${row.margin_pct}%` : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${style.badge}`}>{style.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Pricing() {
  const { canEdit } = useAuth();
  const editAllowed = canEdit('pricing');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pricing / ROI Analysis</h1>
        <p className="text-sm text-gray-500 mt-1">
          Early-warning margin monitor: calculated shipping rate + product cost vs. retail price,
          evaluated per sales channel. Yellow = profitable but below your target margin. Red = not profitable.
        </p>
      </div>

      <ChannelsSection canEdit={editAllowed} />
      <PricingTable canEdit={editAllowed} />
      <RoiSection />
    </div>
  );
}
