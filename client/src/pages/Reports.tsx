import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PackagingAnalysisReport, PackagingStatEntry, ReportState, DimExposedProduct, ProductResultEntry, Packaging } from '../types';
import { getPackagingAnalysis, runPackagingAnalysis, downloadPackagingAnalysisExport, getPackagingSkuReport, downloadPackagingSkuExport } from '../api';

const TYPE_LABELS: Record<string, string> = {
  box: 'Box',
  bubble_mailer: 'Bubble Mailer',
  poly_mailer: 'Poly Mailer',
  other: 'Other',
};

type SortKey = 'name' | 'type' | 'fits_count' | 'best_fit_count' | 'avg_utilization';
type SortDir = 'asc' | 'desc';

function fmt(n: number) {
  return n.toLocaleString();
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({
  label, value, sub, color,
}: {
  label: string; value: string | number; sub?: string; color?: 'green' | 'red' | 'amber' | 'blue';
}) {
  const colors = {
    green: 'border-t-4 border-green-500',
    red: 'border-t-4 border-red-500',
    amber: 'border-t-4 border-amber-400',
    blue: 'border-t-4 border-brand-500',
  };
  return (
    <div className={`bg-white rounded-lg shadow p-5 ${color ? colors[color] : ''}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function QualityBar({ counts }: { counts: PackagingStatEntry['fit_quality_counts'] }) {
  const total = counts.exact + counts.good + counts.loose + counts.large;
  if (total === 0) return <span className="text-gray-300 text-xs">—</span>;
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="flex items-center gap-1 min-w-[80px]">
      {counts.exact > 0 && (
        <div title={`Exact: ${counts.exact}`} style={{ width: `${pct(counts.exact)}%` }}
          className="h-2 rounded bg-green-500 min-w-[4px]" />
      )}
      {counts.good > 0 && (
        <div title={`Good: ${counts.good}`} style={{ width: `${pct(counts.good)}%` }}
          className="h-2 rounded bg-blue-400 min-w-[4px]" />
      )}
      {counts.loose > 0 && (
        <div title={`Loose: ${counts.loose}`} style={{ width: `${pct(counts.loose)}%` }}
          className="h-2 rounded bg-amber-400 min-w-[4px]" />
      )}
      {counts.large > 0 && (
        <div title={`Oversized: ${counts.large}`} style={{ width: `${pct(counts.large)}%` }}
          className="h-2 rounded bg-gray-300 min-w-[4px]" />
      )}
    </div>
  );
}

function SortTh({
  label, col, sortKey, sortDir, onSort,
}: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (col: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? 'text-brand-600' : 'text-gray-300'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  );
}

const FIT_QUALITY_COLORS: Record<string, string> = {
  exact: 'bg-green-50 text-green-700 border-green-200',
  good: 'bg-blue-50 text-blue-700 border-blue-200',
  loose: 'bg-amber-50 text-amber-700 border-amber-200',
  large: 'bg-red-50 text-red-600 border-red-200',
};

function PackagingSkuModal({
  stat,
  onClose,
}: {
  stat: PackagingStatEntry;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<ProductResultEntry[]>([]);
  const [packaging, setPackaging] = useState<Packaging | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    getPackagingSkuReport(stat.packaging.id)
      .then(r => { setPackaging(r.packaging); setProducts(r.products); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [stat.packaging.id]);

  const filtered = filter
    ? products.filter(p =>
        p.id.toLowerCase().includes(filter.toLowerCase()) ||
        p.name.toLowerCase().includes(filter.toLowerCase())
      )
    : products;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-white shadow-sm flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 truncate">{stat.packaging.name}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {loading ? 'Loading…' : `${products.length.toLocaleString()} best-fit product${products.length !== 1 ? 's' : ''}`}
            {packaging && (
              <span className="ml-2 text-gray-400">
                · {packaging.height}" H × {packaging.width}" W × {packaging.length}" L
                {packaging.max_weight ? ` · max ${packaging.max_weight} lbs` : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => downloadPackagingSkuExport(stat.packaging.id)}
            disabled={loading || !!error}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {!loading && !error && products.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0">
          <div className="relative max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter by ID or name…"
              className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {filter && (
              <button onClick={() => setFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {filter && (
            <p className="text-xs text-gray-400 mt-1">{filtered.length.toLocaleString()} of {products.length.toLocaleString()} shown</p>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>
        )}
        {error && (
          <div className="m-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            {filter ? `No products match "${filter}".` : 'No best-fit products for this packaging.'}
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-100 whitespace-nowrap">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product ID</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[180px] whitespace-normal">Name</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">H×W×L (in)</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wt (lbs)</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fit</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Util %</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Wt</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DIM Wt</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DIM?</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Options</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        to={`/configurator?product_id=${encodeURIComponent(p.id)}`}
                        className="text-brand-700 hover:text-brand-900 hover:underline"
                        onClick={onClose}
                        title="Open in Configurator"
                      >
                        {p.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-800 whitespace-normal max-w-[220px]">{p.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{p.height}×{p.width}×{p.length}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{p.weight}</td>
                    <td className="px-3 py-2">
                      {p.fit_quality ? (
                        <span className={`text-xs border rounded px-1.5 py-0.5 font-medium ${FIT_QUALITY_COLORS[p.fit_quality] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {p.fit_quality.charAt(0).toUpperCase() + p.fit_quality.slice(1)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {p.volume_utilization != null ? `${p.volume_utilization}%` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {p.actual_weight != null ? `${p.actual_weight}` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {p.dim_weight != null ? `${p.dim_weight}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {p.dim_exposed ? (
                        <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded font-medium">DIM</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.compatible_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Reports() {
  const [state, setState] = useState<ReportState>({ status: 'pending' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('best_fit_count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showNoFit, setShowNoFit] = useState(false);
  const [showLooseOnly, setShowLooseOnly] = useState(false);
  const [showDimExposed, setShowDimExposed] = useState(false);
  const [skuStat, setSkuStat] = useState<PackagingStatEntry | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchState = async () => {
    try {
      const s = await getPackagingAnalysis();
      setState(s);
      if (s.status === 'running') {
        pollRef.current = setTimeout(fetchState, 3000);
      }
    } catch {
      setError('Failed to load report status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRun = async () => {
    setError('');
    try {
      await runPackagingAnalysis();
      setState({ status: 'running' });
      pollRef.current = setTimeout(fetchState, 3000);
    } catch {
      setError('Failed to start analysis');
    }
  };

  const handleSort = (col: SortKey) => {
    if (sortKey === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(col);
      setSortDir('desc');
    }
  };

  const report: PackagingAnalysisReport | null =
    state.status === 'ready' ? state.data : null;

  const sortedStats = report
    ? [...report.packaging_stats].sort((a, b) => {
        let av: number | string, bv: number | string;
        if (sortKey === 'name') { av = a.packaging.name; bv = b.packaging.name; }
        else if (sortKey === 'type') { av = a.packaging.type; bv = b.packaging.type; }
        else if (sortKey === 'fits_count') { av = a.fits_count; bv = b.fits_count; }
        else if (sortKey === 'best_fit_count') { av = a.best_fit_count; bv = b.best_fit_count; }
        else { av = a.avg_utilization ?? -1; bv = b.avg_utilization ?? -1; }
        if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
        return sortDir === 'asc' ? av - (bv as number) : (bv as number) - av;
      })
    : [];

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packaging Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">
            Runs every 6 hours automatically. Evaluates every product against every active packaging option.
          </p>
          {state.status === 'ready' && (
            <p className="text-xs text-gray-400 mt-1">
              Last run {timeAgo(state.computed_at)} —{' '}
              {new Date(state.computed_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {state.status === 'ready' && (
            <button
              onClick={downloadPackagingAnalysisExport}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Excel
            </button>
          )}
          <button
            onClick={handleRun}
            disabled={state.status === 'running'}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
          >
            {state.status === 'running' ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Running…
              </>
            ) : (
              state.status === 'ready' ? 'Refresh Now' : 'Run Analysis'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      {/* States */}
      {loading && (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">Loading…</div>
      )}

      {!loading && state.status === 'pending' && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-sm mb-4">No analysis has been run yet.</p>
          <button onClick={handleRun} className="px-5 py-2 bg-brand-600 text-white text-sm rounded hover:bg-brand-700">
            Run Analysis Now
          </button>
        </div>
      )}

      {!loading && state.status === 'running' && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg className="w-8 h-8 animate-spin text-brand-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-gray-600 font-medium">Analysis in progress…</p>
          <p className="text-gray-400 text-sm mt-1">
            Evaluating all products against all packaging options. This may take a minute for large catalogs.
          </p>
        </div>
      )}

      {!loading && state.status === 'error' && (
        <div className="bg-white rounded-lg shadow p-8">
          <p className="text-red-600 font-medium mb-1">Analysis failed</p>
          <p className="text-sm text-gray-500">{state.error}</p>
          <button onClick={handleRun} className="mt-4 px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700">
            Try Again
          </button>
        </div>
      )}

      {!loading && report && (
        <div className="space-y-6">
          {/* Context bar */}
          <p className="text-xs text-gray-400">
            {fmt(report.products_analyzed)} products · {fmt(report.packaging_evaluated)} packaging options · {fmt(report.shipping_methods_evaluated)} carriers · DIM divisor {report.settings.dim_divisor}
          </p>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Coverage Rate"
              value={`${report.coverage_rate}%`}
              sub={`${fmt(report.has_packaging_count)} of ${fmt(report.products_analyzed)} products`}
              color="green"
            />
            <StatCard
              label="No Packaging Found"
              value={fmt(report.no_packaging_count)}
              sub="products need a larger box"
              color={report.no_packaging_count > 0 ? 'red' : undefined}
            />
            <StatCard
              label="Loose Fit Only"
              value={fmt(report.loose_only_count)}
              sub="products need a smaller option"
              color={report.loose_only_count > 0 ? 'amber' : undefined}
            />
            <StatCard
              label="DIM Exposure"
              value={`${report.dim_exposure_rate}%`}
              sub={`${fmt(report.dim_exposure_count)} products DIM-billed by ≥1 carrier`}
              color="blue"
            />
          </div>

          {/* Packaging Utilization Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Packaging Utilization</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Best Fit = number of products for which this is the top-ranked option.
                Hover the quality bar for exact counts.
                <span className="ml-1 text-brand-600">Click a packaging name to view its SKU report.</span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <SortTh label="Packaging" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Type" col="type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Fits" col="fits_count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Best Fit" col="best_fit_count" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sole Option</th>
                    <SortTh label="Avg Util %" col="avg_utilization" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fit Quality Mix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedStats.map((stat, i) => {
                    const unused = stat.best_fit_count === 0;
                    return (
                      <tr key={stat.packaging.id} className={`${unused ? 'opacity-50' : ''} ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                          <button
                            onClick={() => setSkuStat(stat)}
                            className="text-brand-700 hover:text-brand-900 hover:underline text-left font-medium"
                            title="View SKU report for this packaging"
                          >
                            {stat.packaging.name}
                          </button>
                          {unused && <span className="ml-2 text-xs text-gray-400 font-normal italic">never best fit</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                          <span className="text-xs bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                            {TYPE_LABELS[stat.packaging.type] ?? stat.packaging.type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 font-mono">{fmt(stat.fits_count)}</td>
                        <td className="px-3 py-2.5 font-mono font-semibold text-gray-900">{fmt(stat.best_fit_count)}</td>
                        <td className="px-3 py-2.5">
                          {stat.sole_option ? (
                            <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                              ★ Sole option
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-gray-700">
                          {stat.avg_utilization != null ? `${stat.avg_utilization}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <QualityBar counts={stat.fit_quality_counts} />
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {[
                                stat.fit_quality_counts.exact > 0 ? `${stat.fit_quality_counts.exact} exact` : '',
                                stat.fit_quality_counts.good > 0 ? `${stat.fit_quality_counts.good} good` : '',
                                stat.fit_quality_counts.loose > 0 ? `${stat.fit_quality_counts.loose} loose` : '',
                                stat.fit_quality_counts.large > 0 ? `${stat.fit_quality_counts.large} over` : '',
                              ].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Type Breakdown + DIM by Carrier — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Packaging Type Breakdown */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">By Packaging Type</h2>
              </div>
              <table className="min-w-full text-sm divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Options</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Best Fit</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Util</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.type_breakdown.map((t, i) => (
                    <tr key={t.type} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {TYPE_LABELS[t.type] ?? t.type}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gray-600">{t.packaging_count}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-gray-900">{fmt(t.best_fit_count)}</td>
                      <td className="px-4 py-2.5 font-mono text-gray-600">
                        {t.avg_utilization != null ? `${t.avg_utilization}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* DIM Exposure by Carrier */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">DIM Exposure by Carrier</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Products where a carrier's DIM weight exceeds actual weight on the best packaging option. A product may appear in multiple carriers if it qualifies for more than one method.
                </p>
              </div>
              {report.dim_by_carrier.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400">No active shipping methods.</p>
              ) : (
                <table className="min-w-full text-sm divide-y divide-gray-100">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carrier / Method</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DIM-billed Products</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">% of Catalog</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.dim_by_carrier.map((c, i) => (
                      <tr key={c.method_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{c.method_name}</td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-gray-900">{fmt(c.dim_billed_count)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[80px]">
                              <div
                                className="h-1.5 rounded-full bg-amber-400"
                                style={{ width: `${Math.min(c.pct_of_catalog, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono text-gray-600">{c.pct_of_catalog}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Coverage Gaps */}
          {(report.no_packaging_count > 0 || report.loose_only_count > 0 || report.dim_exposure_count > 0) && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">Coverage Gaps</h2>

              {report.no_packaging_count > 0 && (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <button
                    onClick={() => setShowNoFit(v => !v)}
                    className="w-full px-5 py-4 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                        {report.no_packaging_count}
                      </span>
                      <span className="font-semibold text-gray-900">No Packaging Found</span>
                      <span className="text-sm text-gray-500">— these products fit zero active packaging options</span>
                    </div>
                    <span className="text-gray-400 text-sm">{showNoFit ? '▲' : '▼'}</span>
                  </button>
                  {showNoFit && (
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="min-w-full text-sm divide-y divide-gray-100">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">H (in)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">W (in)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">L (in)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Wt (lbs)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.no_fit_products.map((p, i) => (
                            <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-2 font-mono">
                                <Link
                                  to={`/configurator?product_id=${encodeURIComponent(p.id)}`}
                                  className="text-brand-700 hover:text-brand-900 hover:underline"
                                  title={`Open ${p.id} in Configurator`}
                                >
                                  {p.id}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-gray-800">{p.name}</td>
                              <td className="px-3 py-2 font-mono text-gray-600">{p.height}</td>
                              <td className="px-3 py-2 font-mono text-gray-600">{p.width}</td>
                              <td className="px-3 py-2 font-mono text-gray-600">{p.length}</td>
                              <td className="px-3 py-2 font-mono text-gray-600">{p.weight}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {report.loose_only_count > 0 && (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <button
                    onClick={() => setShowLooseOnly(v => !v)}
                    className="w-full px-5 py-4 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                        {report.loose_only_count}
                      </span>
                      <span className="font-semibold text-gray-900">Only Loose/Oversized Fits</span>
                      <span className="text-sm text-gray-500">— consider adding a better-sized option</span>
                    </div>
                    <span className="text-gray-400 text-sm">{showLooseOnly ? '▲' : '▼'}</span>
                  </button>
                  {showLooseOnly && (
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="min-w-full text-sm divide-y divide-gray-100">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">H (in)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">W (in)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">L (in)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Wt (lbs)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.loose_only_products.map((p, i) => (
                            <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-2 font-mono">
                                <Link
                                  to={`/configurator?product_id=${encodeURIComponent(p.id)}`}
                                  className="text-brand-700 hover:text-brand-900 hover:underline"
                                  title={`Open ${p.id} in Configurator`}
                                >
                                  {p.id}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-gray-800">{p.name}</td>
                              <td className="px-3 py-2 font-mono text-gray-600">{p.height}</td>
                              <td className="px-3 py-2 font-mono text-gray-600">{p.width}</td>
                              <td className="px-3 py-2 font-mono text-gray-600">{p.length}</td>
                              <td className="px-3 py-2 font-mono text-gray-600">{p.weight}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {report.dim_exposure_count > 0 && (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <button
                    onClick={() => setShowDimExposed(v => !v)}
                    className="w-full px-5 py-4 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                        {report.dim_exposure_count}
                      </span>
                      <span className="font-semibold text-gray-900">DIM Exposure</span>
                      <span className="text-sm text-gray-500">— at least one carrier bills by dimensional weight</span>
                    </div>
                    <span className="text-gray-400 text-sm">{showDimExposed ? '▲' : '▼'}</span>
                  </button>
                  {showDimExposed && (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="min-w-full text-sm divide-y divide-gray-100">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Best Packaging</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actual Wt</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">DIM by Carrier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(report.dim_exposed_products as DimExposedProduct[]).map((p, i) => (
                            <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-2 font-mono">
                                <Link
                                  to={`/configurator?product_id=${encodeURIComponent(p.id)}`}
                                  className="text-brand-700 hover:text-brand-900 hover:underline"
                                  title={`Open ${p.id} in Configurator`}
                                >
                                  {p.id}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-gray-800">{p.name}</td>
                              <td className="px-3 py-2 text-gray-500 text-xs">{p.best_packaging_name ?? '—'}</td>
                              <td className="px-3 py-2 font-mono text-right text-gray-600 whitespace-nowrap">{p.actual_weight} lbs</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {p.dim_carriers.map(c => (
                                    <span key={c.method_name} className="inline-flex items-center gap-1 text-xs bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                      <span className="text-gray-600 font-medium">{c.method_name}</span>
                                      <span className="text-gray-400">·</span>
                                      <span className="text-amber-700 font-semibold font-mono">{c.dim_weight} lbs DIM</span>
                                      <span className="text-gray-400">·</span>
                                      <span className="text-gray-600 font-mono">billed {c.billed_weight} lbs</span>
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {report.no_packaging_count === 0 && report.loose_only_count === 0 && report.dim_exposure_count === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-5 py-4 text-sm text-green-800">
              No coverage gaps — every product has at least one well-fitting packaging option.
            </div>
          )}
        </div>
      )}

      {/* SKU Drill-down Modal */}
      {skuStat && (
        <PackagingSkuModal stat={skuStat} onClose={() => setSkuStat(null)} />
      )}
    </div>
  );
}
