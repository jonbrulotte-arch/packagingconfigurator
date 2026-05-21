import { useState } from 'react';
import { AnalyzeResponse, ConfiguratorResult, RequestItem } from '../types';
import { analyzeProducts } from '../api';

const FIT_COLORS: Record<ConfiguratorResult['fit_quality'], string> = {
  exact: 'bg-green-100 text-green-800 border-green-200',
  good: 'bg-blue-100 text-blue-800 border-blue-200',
  snug: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  large: 'bg-gray-100 text-gray-700 border-gray-200',
};

const FIT_LABELS: Record<ConfiguratorResult['fit_quality'], string> = {
  exact: 'Exact Fit',
  good: 'Good Fit',
  snug: 'Snug Fit',
  large: 'Oversized',
};

const TYPE_LABELS: Record<string, string> = {
  box: 'Box',
  bubble_mailer: 'Bubble Mailer',
  poly_mailer: 'Poly Mailer',
  other: 'Other',
};

interface Row {
  id: string;
  product_id: string;
  quantity: string;
}

let nextId = 1;
const makeRow = (): Row => ({ id: String(nextId++), product_id: '', quantity: '1' });

export default function Configurator() {
  const [rows, setRows] = useState<Row[]>([makeRow()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<AnalyzeResponse | null>(null);

  const updateRow = (id: string, field: keyof Omit<Row, 'id'>, value: string) =>
    setRows(rs => rs.map(r => (r.id === id ? { ...r, [field]: value } : r)));

  const removeRow = (id: string) =>
    setRows(rs => rs.length > 1 ? rs.filter(r => r.id !== id) : rs);

  const addRow = () => setRows(rs => [...rs, makeRow()]);

  const handleKeyDown = (e: React.KeyboardEvent, rowId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const idx = rows.findIndex(r => r.id === rowId);
      if (idx === rows.length - 1) addRow();
    }
  };

  const handleAnalyze = async () => {
    setError('');
    setResponse(null);

    const items: RequestItem[] = [];
    for (const row of rows) {
      const pid = row.product_id.trim();
      const qty = parseInt(row.quantity, 10);
      if (!pid) continue;
      if (isNaN(qty) || qty < 1) {
        setError(`Quantity for "${pid}" must be a whole number ≥ 1`);
        return;
      }
      items.push({ product_id: pid, quantity: qty });
    }

    if (items.length === 0) {
      setError('Enter at least one product ID');
      return;
    }

    setLoading(true);
    try {
      setResponse(await analyzeProducts(items));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setRows([makeRow()]);
    setResponse(null);
    setError('');
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Package Configurator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enter product IDs and quantities to find the best fitting packaging.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        {/* Row table */}
        <div className="mb-3">
          <div className="grid grid-cols-[1fr_90px_36px] gap-2 mb-2 px-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Product ID</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Qty</span>
            <span />
          </div>

          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={row.id} className="grid grid-cols-[1fr_90px_36px] gap-2 items-center">
                <input
                  value={row.product_id}
                  onChange={e => updateRow(row.id, 'product_id', e.target.value)}
                  onKeyDown={e => handleKeyDown(e, row.id)}
                  placeholder={`SKU-00${idx + 1}`}
                  className="border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  autoFocus={idx === rows.length - 1 && idx > 0}
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={row.quantity}
                  onChange={e => updateRow(row.id, 'quantity', e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1}
                  className="flex items-center justify-center h-9 w-9 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Remove row"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={addRow}
          className="text-sm text-brand-600 hover:text-brand-800 flex items-center gap-1 mt-3"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add product
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="px-6 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : 'Find Best Packaging'}
          </button>
          {(response || rows.some(r => r.product_id)) && (
            <button
              onClick={handleClear}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-400">
          Tip: press Enter in a product ID field to add the next row.
        </p>
      </div>

      {response && (
        <div className="space-y-6">
          {/* Items summary */}
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Shipment Summary — {response.total_item_count} unit{response.total_item_count !== 1 ? 's' : ''}
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">H × W × L (in)</th>
                    <th className="pb-2 pr-4">Unit Wt (lbs)</th>
                    <th className="pb-2 pr-4 text-center">Qty</th>
                    <th className="pb-2 text-right">Line Wt (lbs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {response.items.map(({ product: p, quantity: qty }) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-4 font-mono text-brand-700">{p.id}</td>
                      <td className="py-2 pr-4">{p.name}</td>
                      <td className="py-2 pr-4 font-mono">{p.height} × {p.width} × {p.length}</td>
                      <td className="py-2 pr-4 font-mono">{p.weight}</td>
                      <td className="py-2 pr-4 text-center font-semibold">{qty}</td>
                      <td className="py-2 text-right font-mono">{(p.weight * qty).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-semibold">
                    <td colSpan={5} className="pt-2 text-gray-600 text-right pr-4">Combined weight:</td>
                    <td className="pt-2 text-right font-mono">{response.total_actual_weight.toFixed(3)} lbs</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Results */}
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              {response.results.length === 0
                ? 'No Packaging Options Found'
                : `${response.results.length} Compatible Option${response.results.length !== 1 ? 's' : ''} (best fit first)`}
            </h2>

            {response.results.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-sm text-amber-800">
                No active packaging options can fit all selected products at the requested quantities.
                Try adding larger boxes or splitting into multiple shipments.
              </div>
            )}

            <div className="space-y-4">
              {response.results.map((r, i) => (
                <div
                  key={r.packaging.id}
                  className={`bg-white rounded-lg shadow border-l-4 p-5 ${
                    i === 0
                      ? 'border-l-green-500'
                      : r.weight_flag || r.max_weight_flag
                      ? 'border-l-amber-400'
                      : 'border-l-gray-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {i === 0 && (
                          <span className="text-xs font-bold bg-green-600 text-white px-2 py-0.5 rounded">
                            BEST FIT
                          </span>
                        )}
                        <h3 className="font-semibold text-gray-900">{r.packaging.name}</h3>
                        <span className="text-xs text-gray-500">{TYPE_LABELS[r.packaging.type] ?? r.packaging.type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${FIT_COLORS[r.fit_quality]}`}>
                          {FIT_LABELS[r.fit_quality]}
                        </span>
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
                      <p className="font-semibold">
                        {r.packaging_weight > 0 ? `${r.packaging_weight.toFixed(3)} lbs` : '—'}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded p-3 border border-gray-300">
                      <p className="text-xs text-gray-500 mb-1">Total Billed Weight</p>
                      <p className="font-bold text-gray-900">{r.total_weight.toFixed(3)} lbs</p>
                    </div>
                    <div className={`rounded p-3 ${r.weight_flag ? 'bg-amber-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-500 mb-1">Dim Weight</p>
                      <p className={`font-semibold ${r.weight_flag ? 'text-amber-700' : ''}`}>
                        {r.dim_weight.toFixed(2)} lbs
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Box Volume</p>
                      <p className="font-semibold">
                        {(r.packaging.height * r.packaging.width * r.packaging.length).toFixed(1)} in³
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">DIM Divisor</p>
                      <p className="font-semibold">{response.settings.dim_divisor}</p>
                    </div>
                  </div>

                  {(r.weight_flag || r.max_weight_flag) && (
                    <div className="mt-3 space-y-2">
                      {r.weight_flag && (
                        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
                          <span className="text-amber-500 font-bold mt-0.5">⚠</span>
                          <span className="text-amber-800">
                            <strong>Dimensional weight flag:</strong> Dimensional weight ({r.dim_weight.toFixed(2)} lbs) exceeds
                            total billed weight ({r.total_weight.toFixed(3)} lbs). Carrier will bill by dimensional weight.
                          </span>
                        </div>
                      )}
                      {r.max_weight_flag && (
                        <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
                          <span className="text-red-500 font-bold mt-0.5">✕</span>
                          <span className="text-red-800">
                            <strong>Overweight:</strong> Total weight including packaging ({r.total_weight.toFixed(3)} lbs) exceeds
                            this packaging's max weight ({r.packaging.max_weight} lbs).
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
        </div>
      )}
    </div>
  );
}
