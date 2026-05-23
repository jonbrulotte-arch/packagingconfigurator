import { useState } from 'react';
import { AnalyzeResponse, ConfiguratorResult, StandaloneResult } from '../types';
import { analyzeManual, ManualItem } from '../api';

const FIT_COLORS: Record<ConfiguratorResult['fit_quality'], string> = {
  exact: 'bg-green-100 text-green-800 border-green-200',
  good: 'bg-blue-100 text-blue-800 border-blue-200',
  loose: 'bg-amber-100 text-amber-800 border-amber-200',
  large: 'bg-gray-100 text-gray-700 border-gray-200',
};

const FIT_LABELS: Record<ConfiguratorResult['fit_quality'], string> = {
  exact: 'Exact Fit',
  good: 'Good Fit',
  loose: 'Loose Fit',
  large: 'Oversized',
};

const TYPE_LABELS: Record<string, string> = {
  box: 'Box',
  bubble_mailer: 'Bubble Mailer',
  poly_mailer: 'Poly Mailer',
  other: 'Other',
};

interface FormItem {
  id: number;
  name: string;
  height: string;
  width: string;
  length: string;
  weight: string;
  quantity: string;
  foldable: boolean;
  ships_in_own_packaging: boolean;
}

let nextId = 1;
const makeItem = (): FormItem => ({
  id: nextId++,
  name: '',
  height: '',
  width: '',
  length: '',
  weight: '',
  quantity: '1',
  foldable: false,
  ships_in_own_packaging: false,
});

export default function ManualConfigurator() {
  const [items, setItems] = useState<FormItem[]>([makeItem()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<AnalyzeResponse | null>(null);

  const updateItem = <K extends keyof FormItem>(id: number, field: K, value: FormItem[K]) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));

  const removeItem = (id: number) =>
    setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== id) : prev);

  const addItem = () => setItems(prev => [...prev, makeItem()]);

  const handleAnalyze = async () => {
    setError('');
    setResponse(null);

    const payload: ManualItem[] = [];
    for (const it of items) {
      const h = parseFloat(it.height);
      const w = parseFloat(it.width);
      const l = parseFloat(it.length);
      const wt = parseFloat(it.weight);
      const qty = parseInt(it.quantity, 10);
      if (isNaN(h) || isNaN(w) || isNaN(l) || h <= 0 || w <= 0 || l <= 0) {
        setError(`Item ${payload.length + 1}: height, width, and length are required and must be > 0`);
        return;
      }
      if (isNaN(wt) || wt < 0) {
        setError(`Item ${payload.length + 1}: weight must be a non-negative number`);
        return;
      }
      if (isNaN(qty) || qty < 1) {
        setError(`Item ${payload.length + 1}: quantity must be a whole number ≥ 1`);
        return;
      }
      payload.push({
        name: it.name.trim() || `Item ${payload.length + 1}`,
        height: h, width: w, length: l, weight: wt, quantity: qty,
        foldable: it.foldable ? 1 : 0,
        ships_in_own_packaging: it.ships_in_own_packaging ? 1 : 0,
      });
    }

    setLoading(true);
    try {
      setResponse(await analyzeManual(payload));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setItems([makeItem()]);
    setResponse(null);
    setError('');
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Manual Configurator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enter product dimensions directly — no product record needed.
        </p>
      </div>

      <div className="space-y-4 mb-6">
        {items.map((it, idx) => (
          <div key={it.id} className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Item {idx + 1}</h3>
              <button
                onClick={() => removeItem(it.id)}
                disabled={items.length === 1}
                className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Remove item"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name (optional)</label>
                <input
                  type="text"
                  value={it.name}
                  onChange={e => updateItem(it.id, 'name', e.target.value)}
                  placeholder="My Product"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={it.quantity}
                  onChange={e => updateItem(it.id, 'quantity', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {(['height', 'width', 'length'] as const).map(dim => (
                <div key={dim}>
                  <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{dim} (in)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={it[dim]}
                    onChange={e => updateItem(it.id, dim, e.target.value)}
                    placeholder="0.0"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Weight (lbs)</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={it.weight}
                  onChange={e => updateItem(it.id, 'weight', e.target.value)}
                  placeholder="0.0"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={it.foldable}
                  onChange={e => updateItem(it.id, 'foldable', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Foldable
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={it.ships_in_own_packaging}
                  onChange={e => updateItem(it.id, 'ships_in_own_packaging', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Ships in Own Packaging
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={addItem}
            className="text-sm text-brand-600 hover:text-brand-800 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add item
          </button>
          <div className="flex-1" />
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="px-6 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : 'Find Packaging'}
          </button>
          {(response || items.some(it => it.height || it.width || it.length)) && (
            <button
              onClick={handleClear}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {response && <Results response={response} />}
    </div>
  );
}

function Results({ response }: { response: AnalyzeResponse }) {
  return (
    <div className="space-y-6">
      {/* Shipment summary */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          Shipment Summary — {response.total_item_count} unit{response.total_item_count !== 1 ? 's' : ''}
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4 hidden sm:table-cell">H × W × L (in)</th>
                <th className="pb-2 pr-4">Wt (lbs)</th>
                <th className="pb-2 pr-4 text-center">Qty</th>
                <th className="pb-2 text-right">Line Wt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {response.items.map(({ product: p, quantity: qty }) => (
                <tr key={p.id}>
                  <td className="py-2 pr-4 whitespace-normal">
                    {p.name}
                    {!!p.foldable && (
                      <span className="ml-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">↕ folded</span>
                    )}
                    {!!p.ships_in_own_packaging && (
                      <span className="ml-2 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">✦ ships own</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono hidden sm:table-cell">{p.height} × {p.width} × {p.length}</td>
                  <td className="py-2 pr-4 font-mono">{p.weight}</td>
                  <td className="py-2 pr-4 text-center font-semibold">{qty}</td>
                  <td className="py-2 text-right font-mono">{(p.weight * qty).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td colSpan={4} className="pt-2 text-gray-600 text-right pr-4">Combined:</td>
                <td className="pt-2 text-right font-mono">{response.total_actual_weight.toFixed(3)} lbs</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* LTL banner */}
      {response.ltl_required && (
        <div className="bg-red-50 border-2 border-red-400 rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-red-800">LTL Freight Required</h3>
              <p className="text-sm text-red-700">
                Shipment weight ({response.total_actual_weight.toFixed(3)} lbs) exceeds the LTL threshold ({response.settings.ltl_threshold} lbs).
              </p>
            </div>
          </div>
          {response.ltl_shipping.length > 0 && (
            <div className="mt-3 pt-3 border-t border-red-200">
              <p className="text-xs font-semibold text-red-600 uppercase mb-2">Matching Freight Methods</p>
              <div className="flex flex-wrap gap-2">
                {response.ltl_shipping.map(sm => (
                  <span key={sm.method_id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-red-100 border border-red-300 text-red-800 rounded font-medium">
                    {sm.method_name} · {sm.billed_weight} lbs
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ships in own packaging */}
      {response.standalone_items?.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Ships in Own Packaging — {response.standalone_items.length} product{response.standalone_items.length !== 1 ? 's' : ''}
          </h2>
          <div className="space-y-4">
            {response.standalone_items.map((sr: StandaloneResult) => (
              <div key={sr.product.id} className="bg-white rounded-lg shadow border-l-4 border-l-teal-500 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold bg-teal-600 text-white px-2 py-0.5 rounded">SHIPS OWN PKG</span>
                      <h3 className="font-semibold text-gray-900">{sr.product.name}</h3>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 font-mono">
                      {sr.product.height}" H × {sr.product.width}" W × {sr.product.length}" L · {sr.product.weight} lbs/unit
                    </p>
                  </div>
                  {sr.quantity > 1 && (
                    <div className="text-right text-sm">
                      <p className="text-gray-500">Quantity</p>
                      <p className="text-xl font-bold text-gray-900">{sr.quantity}</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-500 mb-1">Products Weight</p>
                    <p className="font-semibold">{sr.products_weight.toFixed(3)} lbs</p>
                  </div>
                  <div className={`rounded p-3 ${sr.weight_flag ? 'bg-amber-50' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-500 mb-1">DIM Weight (per unit)</p>
                    <p className={`font-semibold ${sr.weight_flag ? 'text-amber-700' : ''}`}>{sr.unit_dim_weight} lbs</p>
                  </div>
                  <div className="bg-gray-50 rounded p-3 border border-gray-300">
                    <p className="text-xs text-gray-500 mb-1">Billed Weight (per unit)</p>
                    <p className="font-bold text-gray-900">{sr.unit_billed_weight} lbs</p>
                  </div>
                  {sr.quantity > 1 && (
                    <div className="bg-gray-50 rounded p-3 border border-gray-300">
                      <p className="text-xs text-gray-500 mb-1">Total Billed ({sr.quantity} units)</p>
                      <p className="font-bold text-gray-900">{sr.total_billed_weight} lbs</p>
                    </div>
                  )}
                </div>
                {sr.shipping?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Shipping Methods (per unit)</p>
                    <div className="flex flex-wrap gap-2">
                      {sr.shipping.map(sm => (
                        <div key={sm.method_id} className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 border text-xs bg-indigo-50 border-indigo-200">
                          <span className="font-semibold text-gray-800">{sm.method_name}</span>
                          <span className="text-gray-400">·</span>
                          <span className={`font-medium ${sm.dim_applied ? 'text-amber-600' : 'text-indigo-700'}`}>{sm.billed_weight} lbs</span>
                          {sm.dim_applied && <span className="bg-amber-100 text-amber-700 font-semibold px-1 rounded text-[10px]">DIM</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Packaging results */}
      {(() => {
        const hasPackaged = response.items.some(i => !i.product.ships_in_own_packaging);
        if (!hasPackaged) return null;
        return (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              {response.results.length === 0
                ? (response.ltl_required ? 'No Standard Packaging Options' : 'No Packaging Options Found')
                : `${response.results.length} Compatible Option${response.results.length !== 1 ? 's' : ''} (best fit first)`}
            </h2>

            {response.results.length === 0 && !response.ltl_required && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-sm text-amber-800">
                No active packaging options can fit the specified dimensions at the requested quantities.
                Try adding larger packaging options on the Packaging page.
              </div>
            )}

            <div className="space-y-4">
              {response.results.map((r, i) => (
                <div
                  key={r.packaging.id}
                  className={`bg-white rounded-lg shadow border-l-4 p-5 ${
                    i === 0
                      ? 'border-l-green-500'
                      : r.weight_flag || r.max_weight_flag || r.fit_quality === 'loose' || r.fit_quality === 'large'
                      ? 'border-l-amber-400'
                      : 'border-l-gray-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {i === 0 && <span className="text-xs font-bold bg-green-600 text-white px-2 py-0.5 rounded">BEST FIT</span>}
                        <h3 className="font-semibold text-gray-900">{r.packaging.name}</h3>
                        <span className="text-xs text-gray-500">{TYPE_LABELS[r.packaging.type] ?? r.packaging.type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${FIT_COLORS[r.fit_quality]}`}>
                          {FIT_LABELS[r.fit_quality]}
                        </span>
                        {r.has_folded_items && (
                          <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">↕ items folded</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1 font-mono">
                        {r.packaging.height}" H × {r.packaging.width}" W × {r.packaging.length}" L
                        {r.packaging.max_weight != null && ` · max ${r.packaging.max_weight} lbs`}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-gray-500">Volume utilization</p>
                      <p className="text-xl font-bold text-gray-900">{r.volume_utilization}%</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Products Weight</p>
                      <p className="font-semibold">{r.products_weight.toFixed(3)} lbs</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Packaging Weight</p>
                      <p className="font-semibold">{r.packaging_weight > 0 ? `${r.packaging_weight.toFixed(3)} lbs` : '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3 border border-gray-300">
                      <p className="text-xs text-gray-500 mb-1">Actual Weight</p>
                      <p className="font-bold text-gray-900">{(r.products_weight + r.packaging_weight).toFixed(3)} lbs</p>
                    </div>
                    <div className={`rounded p-3 ${r.weight_flag ? 'bg-amber-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-500 mb-1">DIM Weight</p>
                      <p className={`font-semibold ${r.weight_flag ? 'text-amber-700' : ''}`}>{r.dim_weight} lbs</p>
                    </div>
                  </div>

                  {r.shipping?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Shipping Methods</p>
                      <div className="flex flex-wrap gap-2">
                        {r.shipping.map(sm => (
                          <div key={sm.method_id} className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 border text-xs bg-indigo-50 border-indigo-200">
                            <span className="font-semibold text-gray-800">{sm.method_name}</span>
                            <span className="text-gray-400">·</span>
                            <span className={`font-medium ${sm.dim_applied ? 'text-amber-600' : 'text-indigo-700'}`}>{sm.billed_weight} lbs</span>
                            {sm.dim_applied && <span className="bg-amber-100 text-amber-700 font-semibold px-1 rounded text-[10px]">DIM</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(r.weight_flag || r.max_weight_flag || r.fit_quality === 'loose' || r.fit_quality === 'large') && (
                    <div className="mt-3 space-y-2">
                      {(r.fit_quality === 'loose' || r.fit_quality === 'large') && (
                        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
                          <span className="text-amber-500 font-bold mt-0.5">⚠</span>
                          <span className="text-amber-800">
                            <strong>Loose Fit:</strong> Only {r.volume_utilization}% of this box is used. Consider a smaller option.
                          </span>
                        </div>
                      )}
                      {r.weight_flag && (
                        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
                          <span className="text-amber-500 font-bold mt-0.5">⚠</span>
                          <span className="text-amber-800">
                            <strong>Dimensional weight flag:</strong> DIM weight ({r.dim_weight} lbs) exceeds actual weight ({(r.products_weight + r.packaging_weight).toFixed(2)} lbs).
                          </span>
                        </div>
                      )}
                      {r.max_weight_flag && (
                        <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
                          <span className="text-red-500 font-bold mt-0.5">✕</span>
                          <span className="text-red-800">
                            <strong>Overweight:</strong> Actual weight ({(r.products_weight + r.packaging_weight).toFixed(2)} lbs) exceeds max weight ({r.packaging.max_weight} lbs).
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {r.packaging.notes && (
                    <p className="mt-3 text-xs text-gray-500">Note: {r.packaging.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
