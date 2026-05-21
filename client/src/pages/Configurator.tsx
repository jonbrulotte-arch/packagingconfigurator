import { useState } from 'react';
import { AnalyzeResponse, ConfiguratorResult } from '../types';
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

export default function Configurator() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<AnalyzeResponse | null>(null);

  const handleAnalyze = async () => {
    setError('');
    setResponse(null);
    const ids = input
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      setError('Enter at least one product ID');
      return;
    }
    setLoading(true);
    try {
      setResponse(await analyzeProducts(ids));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Package Configurator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enter one or more product IDs to find the best fitting packaging.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Product ID(s) — one per line or comma-separated
        </label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={4}
          placeholder="SKU-001&#10;SKU-002&#10;SKU-003"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="mt-3 px-6 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Analyzing…' : 'Find Best Packaging'}
        </button>
      </div>

      {response && (
        <div className="space-y-6">
          {/* Products summary */}
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Products ({response.products.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">H × W × L (in)</th>
                    <th className="pb-2">Weight (lbs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {response.products.map(p => (
                    <tr key={p.id}>
                      <td className="py-2 pr-4 font-mono text-brand-700">{p.id}</td>
                      <td className="py-2 pr-4">{p.name}</td>
                      <td className="py-2 pr-4 font-mono">{p.height} × {p.width} × {p.length}</td>
                      <td className="py-2 font-mono">{p.weight}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-medium">
                    <td colSpan={3} className="pt-2 text-gray-600 text-right pr-4">Combined weight:</td>
                    <td className="pt-2 font-mono">{response.total_actual_weight.toFixed(3)} lbs</td>
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
                No active packaging options can fit all selected products. Try adding larger boxes or reducing the product set.
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
                      <p className="text-xs text-gray-500 mb-1">Actual Weight</p>
                      <p className="font-semibold">{r.actual_weight.toFixed(3)} lbs</p>
                    </div>
                    <div className={`rounded p-3 ${r.weight_flag ? 'bg-amber-50' : 'bg-gray-50'}`}>
                      <p className="text-xs text-gray-500 mb-1">Dim Weight</p>
                      <p className={`font-semibold ${r.weight_flag ? 'text-amber-700' : ''}`}>
                        {r.dim_weight.toFixed(2)} lbs
                      </p>
                    </div>
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

                  {/* Flags */}
                  {(r.weight_flag || r.max_weight_flag) && (
                    <div className="mt-3 space-y-2">
                      {r.weight_flag && (
                        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
                          <span className="text-amber-500 font-bold mt-0.5">⚠</span>
                          <span className="text-amber-800">
                            <strong>Dimensional weight flag:</strong> Dimensional weight ({r.dim_weight.toFixed(2)} lbs) exceeds
                            actual weight ({r.actual_weight.toFixed(3)} lbs). Carrier will bill by dimensional weight.
                          </span>
                        </div>
                      )}
                      {r.max_weight_flag && (
                        <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
                          <span className="text-red-500 font-bold mt-0.5">✕</span>
                          <span className="text-red-800">
                            <strong>Overweight:</strong> Combined weight ({r.actual_weight.toFixed(3)} lbs) exceeds
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
