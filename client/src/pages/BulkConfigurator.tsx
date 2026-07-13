import { useState, useRef } from 'react';
import { BulkAnalyzeResponse, BulkShipmentResult, ConfiguratorResult, StandaloneResult } from '../types';
import { bulkAnalyze, downloadBulkTemplate, exportBulkResults } from '../api';

const FIT_COLORS: Record<ConfiguratorResult['fit_quality'], string> = {
  exact: 'bg-green-100 text-green-800',
  good: 'bg-blue-100 text-blue-800',
  loose: 'bg-amber-100 text-amber-800',
  large: 'bg-gray-100 text-gray-600',
};
const FIT_LABELS: Record<ConfiguratorResult['fit_quality'], string> = {
  exact: 'Exact', good: 'Good', loose: 'Loose Fit', large: 'Oversized',
};
const TYPE_LABELS: Record<string, string> = {
  box: 'Box', bubble_mailer: 'Bubble Mailer', poly_mailer: 'Poly Mailer', other: 'Other',
};

function rowStatus(s: BulkShipmentResult): 'error' | 'ltl' | 'flagged' | 'ok' | 'no-match' {
  if (s.error) return 'error';
  if (s.ltl_required) return 'ltl';
  // All items ship in own packaging — no box needed
  const packaged = s.items.filter(i => !i.product.ships_in_own_packaging);
  if (!s.best && packaged.length === 0 && (s.standalone_items?.length ?? 0) > 0) return 'ok';
  if (!s.best) return 'no-match';
  if (s.best.weight_flag || s.best.max_weight_flag || s.best.fit_quality === 'loose' || s.best.fit_quality === 'large') return 'flagged';
  return 'ok';
}

const STATUS_STYLE = {
  ok:         'border-l-green-400',
  flagged:    'border-l-amber-400',
  ltl:        'border-l-red-500',
  'no-match': 'border-l-gray-300',
  error:      'border-l-red-400',
};
const STATUS_ICON = {
  ok:         <span className="text-green-600 font-bold">✓</span>,
  flagged:    <span className="text-amber-500 font-bold">⚠</span>,
  ltl:        <span className="text-red-600 font-bold text-xs font-mono">LTL</span>,
  'no-match': <span className="text-gray-400">—</span>,
  error:      <span className="text-red-500 font-bold">✕</span>,
};

export default function BulkConfigurator() {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<BulkAnalyzeResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResponse(null);
    setExpanded(new Set());
    setLoading(true);
    try {
      setResponse(await bulkAnalyze(file));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleExport = async () => {
    if (!response) return;
    setExporting(true);
    try {
      await exportBulkResults(response.shipments);
    } catch {
      setError('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bulk Configurator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a spreadsheet with multiple shipments — one product row per line, grouped by Grouping ID.
        </p>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <label className={`cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            {loading ? 'Analyzing…' : 'Upload Spreadsheet'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" />
          </label>

          <button
            onClick={downloadBulkTemplate}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Template
          </button>

          {response && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 sm:ml-auto"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {exporting ? 'Exporting…' : 'Export Results (.xlsx)'}
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-400">
          Required columns: <code>Grouping ID</code>, <code>Part Number</code>, <code>Quantity</code>.
          Multiple rows with the same Grouping ID are treated as one shipment.
        </p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* Parse errors */}
      {response && response.parse_errors.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 mb-1">Some rows were skipped during import:</p>
          <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
            {response.parse_errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Summary bar */}
      {response && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total Shipments', value: response.summary.total, color: 'text-gray-900' },
            { label: 'Matched', value: response.summary.matched, color: 'text-green-700' },
            { label: 'Flagged', value: response.summary.flagged, color: 'text-amber-600' },
            { label: 'LTL Freight', value: response.summary.ltl ?? 0, color: 'text-red-600' },
            { label: 'No Match / Error', value: response.summary.errors, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-lg shadow p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Results list */}
      {response && (
        <div className="space-y-2">
          {response.shipments.map(shipment => {
            const status = rowStatus(shipment);
            const isOpen = expanded.has(shipment.id);
            return (
              <div key={shipment.id} className={`bg-white rounded-lg shadow border-l-4 ${STATUS_STYLE[status]}`}>
                {/* Row header — always visible */}
                <button
                  onClick={() => toggleExpand(shipment.id)}
                  className="w-full text-left px-5 py-3 flex items-center gap-4"
                >
                  <span className="w-5 text-center flex-shrink-0">{STATUS_ICON[status]}</span>

                  <span className="font-mono font-semibold text-gray-900 w-20 sm:w-32 flex-shrink-0 truncate">{shipment.id}</span>

                  <span className="text-sm text-gray-500 flex-1 truncate">
                    {shipment.error
                      ? <span className="text-red-600">{shipment.error}</span>
                      : shipment.items.map(i => `${i.product.id} ×${i.quantity}`).join(', ')}
                  </span>

                  {shipment.best && (
                    <span className="hidden sm:flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm text-gray-700 font-medium">{shipment.best.packaging.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${FIT_COLORS[shipment.best.fit_quality]}`}>
                        {FIT_LABELS[shipment.best.fit_quality]}
                      </span>
                      {shipment.best.has_folded_items && <span className="text-xs text-indigo-700 font-semibold">↕</span>}
                      {(shipment.best.fit_quality === 'loose' || shipment.best.fit_quality === 'large') && <span className="text-xs text-amber-600 font-semibold">⚠ Loose</span>}
                      {shipment.best.weight_flag && <span className="text-xs text-amber-600 font-semibold">⚠ DIM</span>}
                      {shipment.best.max_weight_flag && <span className="text-xs text-red-600 font-semibold">✕ OVW</span>}
                    </span>
                  )}

                  {!shipment.error && !shipment.best && (shipment.standalone_items?.length ?? 0) > 0 && (
                    <span className="text-sm text-teal-600 font-medium flex-shrink-0">
                      {shipment.standalone_items.length} ship{shipment.standalone_items.length === 1 ? 's' : ''} own pkg
                    </span>
                  )}
                  {!shipment.error && !shipment.best && !(shipment.standalone_items?.length) && (
                    <span className="text-sm text-gray-400 flex-shrink-0">No packaging found</span>
                  )}

                  <svg
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {isOpen && !shipment.error && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                    {/* Products in this shipment */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Products — {shipment.total_item_count} unit{shipment.total_item_count !== 1 ? 's' : ''} · {shipment.total_actual_weight.toFixed(3)} lbs
                      </p>
                      <div className="overflow-x-auto">
                        <table className="text-sm w-full">
                          <thead>
                            <tr className="text-xs text-gray-400 text-left">
                              <th className="pb-1 pr-4">ID</th>
                              <th className="pb-1 pr-4">Name</th>
                              <th className="pb-1 pr-4">H×W×L (in)</th>
                              <th className="pb-1 pr-4 text-center">Qty</th>
                              <th className="pb-1 text-right">Line Wt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {shipment.items.map(({ product: p, quantity: qty }) => (
                              <tr key={p.id}>
                                <td className="py-1 pr-4 font-mono text-brand-700">{p.id}</td>
                                <td className="py-1 pr-4">{p.name}</td>
                                <td className="py-1 pr-4 font-mono text-xs">{p.height}×{p.width}×{p.length}</td>
                                <td className="py-1 pr-4 text-center font-semibold">{qty}</td>
                                <td className="py-1 text-right font-mono">{(p.weight * qty).toFixed(3)} lbs</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Ships in Own Packaging */}
                    {(shipment.standalone_items?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ships in Own Packaging</p>
                        <div className="space-y-2">
                          {shipment.standalone_items.map((sr: StandaloneResult) => (
                            <div key={sr.product.id} className="rounded border border-teal-200 bg-teal-50 px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-xs font-bold bg-teal-600 text-white px-2 py-0.5 rounded">OWN PKG</span>
                                <span className="font-medium text-sm text-gray-900">{sr.product.name}</span>
                                <span className="text-xs text-gray-500 font-mono">{sr.product.id}</span>
                                <span className="text-xs font-mono text-gray-400 ml-auto">
                                  {sr.product.height}"×{sr.product.width}"×{sr.product.length}" · {sr.product.weight} lbs/unit
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                                <span>Qty: <strong>{sr.quantity}</strong></span>
                                <span>Products: <strong>{sr.products_weight.toFixed(3)} lbs</strong></span>
                                <span className={sr.weight_flag ? 'text-amber-700 font-semibold' : ''}>
                                  DIM/unit: <strong>{sr.unit_dim_weight} lbs</strong>{sr.weight_flag && ' ⚠'}
                                </span>
                                <span>Billed/unit: <strong>{sr.unit_billed_weight} lbs</strong></span>
                                {sr.quantity > 1 && <span>Total billed: <strong>{sr.total_billed_weight} lbs</strong></span>}
                              </div>
                              {sr.shipping && sr.shipping.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {sr.shipping.map(sm => (
                                    <span key={sm.method_id}
                                      className="inline-flex items-center gap-1 text-xs rounded px-2 py-0.5 border bg-indigo-50 border-indigo-200"
                                    >
                                      <span className="font-semibold text-gray-700">{sm.method_name}</span>
                                      <span className={`font-medium ${sm.dim_applied ? 'text-amber-600' : 'text-indigo-700'}`}>
                                        · {sm.billed_weight} lbs
                                      </span>
                                      {sm.dim_applied && <span className="bg-amber-100 text-amber-700 font-semibold px-0.5 rounded text-[9px]">DIM</span>}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* LTL Freight */}
                    {shipment.ltl_required && (
                      <div className="bg-red-50 border border-red-300 rounded px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded">LTL FREIGHT</span>
                          <span className="text-sm font-semibold text-red-800">
                            {shipment.total_actual_weight.toFixed(3)} lbs — exceeds LTL threshold
                          </span>
                        </div>
                        <p className="text-xs text-red-700">This shipment must ship via LTL freight carrier.</p>
                        {shipment.ltl_shipping.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {shipment.ltl_shipping.map(sm => (
                              <span key={sm.method_id}
                                className="text-xs px-2 py-0.5 bg-red-100 border border-red-300 text-red-800 rounded font-medium">
                                {sm.method_name} · {sm.billed_weight} lbs
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Packaging options */}
                    {shipment.results.length === 0 && !shipment.ltl_required ? (
                      <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        No active packaging can fit all products in this shipment.
                      </div>
                    ) : shipment.results.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                          {shipment.results.length} compatible option{shipment.results.length !== 1 ? 's' : ''} (best fit first)
                        </p>
                        <div className="space-y-2">
                          {shipment.results.map((r, i) => (
                            <div key={r.packaging.id} className={`rounded border px-4 py-3 ${i === 0 ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                {i === 0 && <span className="text-xs font-bold bg-green-600 text-white px-2 py-0.5 rounded">BEST FIT</span>}
                                <span className="font-medium text-sm text-gray-900">{r.packaging.name}</span>
                                <span className="text-xs text-gray-400">{TYPE_LABELS[r.packaging.type] ?? r.packaging.type}</span>
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${FIT_COLORS[r.fit_quality]}`}>{FIT_LABELS[r.fit_quality]}</span>
                                {r.has_folded_items && (
                                  <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">↕ items folded</span>
                                )}
                                <span className="text-xs text-gray-400 font-mono ml-auto">
                                  {r.packaging.height}"×{r.packaging.width}"×{r.packaging.length}" · {r.volume_utilization}% fill
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                                <span>Products: <strong>{r.products_weight.toFixed(3)} lbs</strong></span>
                                {r.packaging_weight > 0 && <span>Packaging: <strong>{r.packaging_weight.toFixed(3)} lbs</strong></span>}
                                <span>Actual: <strong>{(r.products_weight + r.packaging_weight).toFixed(3)} lbs</strong></span>
                                <span className={r.weight_flag ? 'text-amber-700 font-semibold' : ''}>
                                  DIM: <strong>{r.dim_weight} lbs</strong>
                                  {r.weight_flag && ' ⚠'}
                                </span>
                                {r.max_weight_flag && <span className="text-red-600 font-semibold">✕ Overweight</span>}
                                {(r.fit_quality === 'loose' || r.fit_quality === 'large') && <span className="text-amber-600 font-semibold">⚠ Loose Fit ({r.volume_utilization}% used)</span>}
                              </div>
                              {r.shipping && r.shipping.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {r.shipping.map(sm => (
                                    <span key={sm.method_id}
                                      className="inline-flex items-center gap-1 text-xs rounded px-2 py-0.5 border bg-indigo-50 border-indigo-200"
                                    >
                                      <span className="font-semibold text-gray-700">{sm.method_name}</span>
                                      <span className={`font-medium ${sm.dim_applied ? 'text-amber-600' : 'text-indigo-700'}`}>
                                        · {sm.billed_weight} lbs
                                      </span>
                                      {sm.dim_applied && <span className="bg-amber-100 text-amber-700 font-semibold px-0.5 rounded text-[9px]">DIM</span>}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
