import { Router } from 'express';
import * as XLSX from 'xlsx';
import db from '../db';
import { Product, Packaging, ShippingMethod, ShippingMatch } from '../types';

const router = Router();

// ── Helpers (mirrors configurator.ts — kept local to avoid coupling) ──────────

function sortedDims(h: number, w: number, l: number): [number, number, number] {
  return [h, w, l].sort((a, b) => b - a) as [number, number, number];
}

function foldedProduct(p: Product): Product {
  if (!p.foldable) return p;
  const [longest, middle, shortest] = sortedDims(p.height, p.width, p.length);
  return { ...p, height: shortest * 2, width: middle, length: longest / 2 };
}

function effectiveBoxDims(box: Packaging): [number, number, number] {
  const h = box.max_height != null ? box.max_height : box.height;
  return sortedDims(h, box.width, box.length);
}

function isFlexibleMailer(box: Packaging): boolean {
  return (box.type === 'bubble_mailer' || box.type === 'poly_mailer') && box.max_height != null;
}

function productFitsInBox(product: Product, box: Packaging): boolean {
  const [pd1, pd2, pd3] = sortedDims(product.height, product.width, product.length);
  if (isFlexibleMailer(box)) {
    const flatD1 = Math.max(box.width, box.length);
    const flatD2 = Math.min(box.width, box.length);
    return box.max_height! >= pd3 && (flatD1 - pd3) >= pd1 && (flatD2 - pd3) >= pd2;
  }
  const [bd1, bd2, bd3] = effectiveBoxDims(box);
  return bd1 >= pd1 && bd2 >= pd2 && bd3 >= pd3;
}

function roundWeight(w: number): number {
  if (w >= 1) return Math.ceil(w);
  return Math.round(w * 1000) / 1000;
}

function fitQualityLabel(pct: number): 'exact' | 'good' | 'loose' | 'large' {
  if (pct >= 90) return 'exact';
  if (pct >= 60) return 'good';
  if (pct >= 35) return 'loose';
  return 'large';
}

function computeShipping(
  dimVolume: number,
  actualWeight: number,
  globalDimDivisor: number,
  methods: ShippingMethod[]
): ShippingMatch[] {
  const matches: ShippingMatch[] = [];
  for (const m of methods) {
    const effectiveDivisor = m.dim_divisor ?? globalDimDivisor;
    const carrierDimWeight = roundWeight(dimVolume / effectiveDivisor);
    const dimApplies = m.dim_threshold == null || dimVolume > m.dim_threshold;
    const carrierBilled = dimApplies
      ? roundWeight(Math.max(actualWeight, carrierDimWeight))
      : roundWeight(actualWeight);
    const withinMin = carrierBilled >= m.min_weight;
    const withinMax = m.max_weight == null || carrierBilled <= m.max_weight;
    if (withinMin && withinMax) {
      matches.push({
        method_id: m.id,
        method_name: m.name,
        billed_weight: carrierBilled,
        dim_applied: dimApplies && carrierDimWeight > actualWeight,
      });
    }
  }
  return matches;
}

// ── Report types ──────────────────────────────────────────────────────────────

export interface PackagingStatEntry {
  packaging: Packaging;
  fits_count: number;
  best_fit_count: number;
  sole_option: boolean;
  fit_quality_counts: { exact: number; good: number; loose: number; large: number };
  avg_utilization: number | null;
}

export interface ProductGap {
  id: string;
  name: string;
  height: number;
  width: number;
  length: number;
  weight: number;
  foldable: number;
  ships_in_own_packaging: number;
}

export interface DimExposedProduct {
  id: string;
  name: string;
  height: number;
  width: number;
  length: number;
  weight: number;
  actual_weight: number;
  dim_weight: number;
  best_packaging_name: string | null;
}

export interface DimCarrierStat {
  method_id: number;
  method_name: string;
  dim_billed_count: number;
  pct_of_catalog: number;
}

export interface TypeBreakdownEntry {
  type: string;
  packaging_count: number;
  best_fit_count: number;
  avg_utilization: number | null;
}

export interface ProductResultEntry {
  id: string;
  name: string;
  height: number;
  width: number;
  length: number;
  weight: number;
  foldable: number;
  ships_in_own_packaging: number;
  best_packaging_id: number | null;
  best_packaging_name: string | null;
  fit_quality: string | null;
  volume_utilization: number | null;
  actual_weight: number | null;
  dim_weight: number | null;
  dim_exposed: boolean;
  compatible_count: number;
}

export interface PackagingAnalysisReport {
  computed_at: string;
  settings: { dim_divisor: number; pack_efficiency: number; ltl_threshold: number };
  products_analyzed: number;
  packaging_evaluated: number;
  shipping_methods_evaluated: number;
  has_packaging_count: number;
  no_packaging_count: number;
  loose_only_count: number;
  coverage_rate: number;
  dim_exposure_count: number;
  dim_exposure_rate: number;
  packaging_stats: PackagingStatEntry[];
  no_fit_products: ProductGap[];
  loose_only_products: ProductGap[];
  dim_exposed_products: DimExposedProduct[];
  dim_by_carrier: DimCarrierStat[];
  type_breakdown: TypeBreakdownEntry[];
  product_results: ProductResultEntry[];
}

// ── Core computation ──────────────────────────────────────────────────────────

let isRunning = false;

export async function computePackagingAnalysis(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  db.prepare(
    `INSERT OR REPLACE INTO report_cache
     (type, status, started_at, payload, error, computed_at)
     VALUES ('packaging_analysis', 'running', ?, NULL, NULL, NULL)`
  ).run(new Date().toISOString());

  try {
    const products = db.prepare('SELECT * FROM products').all() as Product[];
    const packaging = db
      .prepare('SELECT * FROM packaging WHERE active = 1 ORDER BY height * width * length ASC')
      .all() as Packaging[];
    const shippingMethods = db
      .prepare('SELECT * FROM shipping_methods WHERE active = 1 ORDER BY sort_order, min_weight, id')
      .all() as ShippingMethod[];
    const settingsRows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const s = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
    const dimDivisor = Number(s.dim_divisor ?? 139);
    const packEfficiency = Number(s.pack_efficiency ?? 0.70);
    const ltlThreshold = Number(s.ltl_threshold ?? 150);

    // Per-packaging accumulators
    const pkgAccum = new Map<number, {
      pkg: Packaging;
      fits_count: number;
      best_fit_count: number;
      sole_option: boolean;
      fit_quality_counts: { exact: number; good: number; loose: number; large: number };
      util_sum: number;
      util_count: number;
    }>();
    for (const pkg of packaging) {
      pkgAccum.set(pkg.id, {
        pkg,
        fits_count: 0,
        best_fit_count: 0,
        sole_option: false,
        fit_quality_counts: { exact: 0, good: 0, loose: 0, large: 0 },
        util_sum: 0,
        util_count: 0,
      });
    }

    // Per-carrier DIM accumulator
    const carrierAccum = new Map<number, { method_name: string; count: number }>();
    for (const m of shippingMethods) {
      carrierAccum.set(m.id, { method_name: m.name, count: 0 });
    }

    const noFitProducts: ProductGap[] = [];
    const looseOnlyProducts: ProductGap[] = [];
    const dimExposedProducts: DimExposedProduct[] = [];
    const productResults: ProductResultEntry[] = [];
    let hasPackagingCount = 0;
    let dimExposureCount = 0;

    const CHUNK = 100;
    for (let i = 0; i < products.length; i += CHUNK) {
      const chunk = products.slice(i, i + CHUNK);

      for (const product of chunk) {
        const gap: ProductGap = {
          id: product.id,
          name: product.name,
          height: product.height,
          width: product.width,
          length: product.length,
          weight: product.weight,
          foldable: product.foldable,
          ships_in_own_packaging: product.ships_in_own_packaging,
        };

        // Ships-in-own-packaging: DIM from product's own dimensions, no box assigned
        if (product.ships_in_own_packaging) {
          const vol = product.height * product.width * product.length;
          const dimWt = roundWeight(vol / dimDivisor);
          hasPackagingCount++;

          const shipping = computeShipping(vol, product.weight, dimDivisor, shippingMethods);
          let anyDimBilled = false;
          for (const sm of shipping) {
            if (sm.dim_applied) {
              anyDimBilled = true;
              const entry = carrierAccum.get(sm.method_id);
              if (entry) entry.count++;
            }
          }
          if (anyDimBilled) {
            dimExposureCount++;
            dimExposedProducts.push({
              id: product.id,
              name: product.name,
              height: product.height,
              width: product.width,
              length: product.length,
              weight: product.weight,
              actual_weight: product.weight,
              dim_weight: dimWt,
              best_packaging_name: 'Ships in Own Packaging',
            });
          }

          productResults.push({
            ...gap,
            best_packaging_id: null,
            best_packaging_name: 'Ships in Own Packaging',
            fit_quality: null,
            volume_utilization: null,
            actual_weight: product.weight,
            dim_weight: dimWt,
            dim_exposed: anyDimBilled,
            compatible_count: 0,
          });
          continue;
        }

        // Regular product — evaluate each active packaging option at qty=1
        const effectiveProduct = foldedProduct(product);
        const productVol =
          effectiveProduct.height * effectiveProduct.width * effectiveProduct.length;

        interface FitResult {
          pkg: Packaging;
          fit_quality: 'exact' | 'good' | 'loose' | 'large';
          volume_utilization: number;
          actual_weight: number;
          dim_weight: number;
          shipping: ShippingMatch[];
        }

        const fitResults: FitResult[] = [];

        for (const pkg of packaging) {
          if (!productFitsInBox(effectiveProduct, pkg)) continue;

          const [ed1, ed2, ed3] = effectiveBoxDims(pkg);
          const boxVol = ed1 * ed2 * ed3;

          let dimVolume = boxVol;
          if (pkg.max_height != null) {
            const [, , thickness] = sortedDims(
              effectiveProduct.height, effectiveProduct.width, effectiveProduct.length
            );
            const mailerMaterial = isFlexibleMailer(pkg) ? pkg.height : 0;
            const packedThickness = thickness + mailerMaterial;
            if (isFlexibleMailer(pkg)) {
              const flatD1 = Math.max(pkg.width, pkg.length);
              const flatD2 = Math.min(pkg.width, pkg.length);
              dimVolume = (flatD1 - thickness) * (flatD2 - thickness) * packedThickness;
            } else {
              dimVolume = ed1 * ed2 * packedThickness;
            }
          }

          const pkgWt = pkg.packaging_weight ?? 0;
          const totalActual = product.weight + pkgWt;
          const dimWt = roundWeight(dimVolume / dimDivisor);
          const volUtil = Math.round((productVol / boxVol) * 1000) / 10;
          const shipping = computeShipping(dimVolume, totalActual, dimDivisor, shippingMethods);

          fitResults.push({
            pkg,
            fit_quality: fitQualityLabel(volUtil),
            volume_utilization: volUtil,
            actual_weight: totalActual,
            dim_weight: dimWt,
            shipping,
          });
        }

        fitResults.sort((a, b) => b.volume_utilization - a.volume_utilization);

        if (fitResults.length === 0) {
          noFitProducts.push(gap);
          productResults.push({
            ...gap,
            best_packaging_id: null,
            best_packaging_name: null,
            fit_quality: null,
            volume_utilization: null,
            actual_weight: product.weight,
            dim_weight: roundWeight(
              (product.height * product.width * product.length) / dimDivisor
            ),
            dim_exposed: false,
            compatible_count: 0,
          });
          continue;
        }

        hasPackagingCount++;

        if (fitResults.every(r => r.fit_quality === 'loose' || r.fit_quality === 'large')) {
          looseOnlyProducts.push(gap);
        }

        const best = fitResults[0];
        let anyDimBilled = false;
        for (const sm of best.shipping) {
          if (sm.dim_applied) {
            anyDimBilled = true;
            const entry = carrierAccum.get(sm.method_id);
            if (entry) entry.count++;
          }
        }
        if (anyDimBilled) {
          dimExposureCount++;
          dimExposedProducts.push({
            id: product.id,
            name: product.name,
            height: product.height,
            width: product.width,
            length: product.length,
            weight: product.weight,
            actual_weight: best.actual_weight,
            dim_weight: best.dim_weight,
            best_packaging_name: best.pkg.name,
          });
        }

        // Accumulate per-packaging stats
        for (const r of fitResults) {
          const acc = pkgAccum.get(r.pkg.id);
          if (!acc) continue;
          acc.fits_count++;
          acc.fit_quality_counts[r.fit_quality]++;
          acc.util_sum += r.volume_utilization;
          acc.util_count++;
        }
        const bestAcc = pkgAccum.get(best.pkg.id);
        if (bestAcc) {
          bestAcc.best_fit_count++;
          if (fitResults.length === 1) bestAcc.sole_option = true;
        }

        productResults.push({
          ...gap,
          best_packaging_id: best.pkg.id,
          best_packaging_name: best.pkg.name,
          fit_quality: best.fit_quality,
          volume_utilization: best.volume_utilization,
          actual_weight: best.actual_weight,
          dim_weight: best.dim_weight,
          dim_exposed: anyDimBilled,
          compatible_count: fitResults.length,
        });
      }

      // Yield between chunks so the event loop stays responsive
      await new Promise<void>(resolve => setImmediate(resolve));
    }

    // Build packaging_stats sorted by best_fit_count desc
    const packagingStats: PackagingStatEntry[] = [...pkgAccum.values()]
      .map(acc => ({
        packaging: acc.pkg,
        fits_count: acc.fits_count,
        best_fit_count: acc.best_fit_count,
        sole_option: acc.sole_option,
        fit_quality_counts: acc.fit_quality_counts,
        avg_utilization:
          acc.util_count > 0
            ? Math.round((acc.util_sum / acc.util_count) * 10) / 10
            : null,
      }))
      .sort((a, b) => b.best_fit_count - a.best_fit_count);

    // Type breakdown
    const typeMap = new Map<string, {
      count: number; best_fit: number; util_sum: number; util_count: number;
    }>();
    for (const stat of packagingStats) {
      const t = stat.packaging.type;
      if (!typeMap.has(t)) typeMap.set(t, { count: 0, best_fit: 0, util_sum: 0, util_count: 0 });
      const entry = typeMap.get(t)!;
      entry.count++;
      entry.best_fit += stat.best_fit_count;
      if (stat.avg_utilization != null && stat.fits_count > 0) {
        entry.util_sum += stat.avg_utilization * stat.fits_count;
        entry.util_count += stat.fits_count;
      }
    }
    const typeBreakdown: TypeBreakdownEntry[] = [...typeMap.entries()]
      .map(([type, d]) => ({
        type,
        packaging_count: d.count,
        best_fit_count: d.best_fit,
        avg_utilization:
          d.util_count > 0 ? Math.round((d.util_sum / d.util_count) * 10) / 10 : null,
      }))
      .sort((a, b) => b.best_fit_count - a.best_fit_count);

    const report: PackagingAnalysisReport = {
      computed_at: new Date().toISOString(),
      settings: { dim_divisor: dimDivisor, pack_efficiency: packEfficiency, ltl_threshold: ltlThreshold },
      products_analyzed: products.length,
      packaging_evaluated: packaging.length,
      shipping_methods_evaluated: shippingMethods.length,
      has_packaging_count: hasPackagingCount,
      no_packaging_count: noFitProducts.length,
      loose_only_count: looseOnlyProducts.length,
      coverage_rate:
        products.length > 0
          ? Math.round((hasPackagingCount / products.length) * 1000) / 10
          : 0,
      dim_exposure_count: dimExposureCount,
      dim_exposure_rate:
        products.length > 0
          ? Math.round((dimExposureCount / products.length) * 1000) / 10
          : 0,
      packaging_stats: packagingStats,
      no_fit_products: noFitProducts,
      loose_only_products: looseOnlyProducts,
      dim_exposed_products: dimExposedProducts,
      dim_by_carrier: [...carrierAccum.entries()]
        .map(([method_id, d]) => ({
          method_id,
          method_name: d.method_name,
          dim_billed_count: d.count,
          pct_of_catalog:
            products.length > 0
              ? Math.round((d.count / products.length) * 1000) / 10
              : 0,
        }))
        .sort((a, b) => b.dim_billed_count - a.dim_billed_count),
      type_breakdown: typeBreakdown,
      product_results: productResults,
    };

    db.prepare(
      `INSERT OR REPLACE INTO report_cache
       (type, status, payload, computed_at, error, started_at)
       VALUES ('packaging_analysis', 'ready', ?, ?, NULL, NULL)`
    ).run(JSON.stringify(report), report.computed_at);

    console.log(
      `[Reports] Packaging analysis complete: ${products.length} products, ` +
      `${packaging.length} packaging options, ${shippingMethods.length} carriers`
    );
  } catch (err) {
    console.error('[Reports] Packaging analysis failed:', err);
    db.prepare(
      `INSERT OR REPLACE INTO report_cache
       (type, status, error, payload, computed_at, started_at)
       VALUES ('packaging_analysis', 'error', ?, NULL, NULL, NULL)`
    ).run(err instanceof Error ? err.message : String(err));
  } finally {
    isRunning = false;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

type CacheRow = {
  type: string;
  status: string;
  payload: string | null;
  error: string | null;
  computed_at: string | null;
  started_at: string | null;
};

router.get('/packaging-analysis', (_req, res) => {
  const cached = db
    .prepare("SELECT * FROM report_cache WHERE type = 'packaging_analysis'")
    .get() as CacheRow | undefined;

  if (!cached) return res.json({ status: 'pending' });
  if (cached.status === 'running')
    return res.json({ status: 'running', started_at: cached.started_at });
  if (cached.status === 'error')
    return res.json({ status: 'error', error: cached.error });

  // Strip product_results from the display response — only needed for export
  const report: PackagingAnalysisReport = JSON.parse(cached.payload!);
  const { product_results: _omit, ...displayReport } = report;
  return res.json({ status: 'ready', computed_at: cached.computed_at, data: displayReport });
});

router.post('/packaging-analysis/run', (_req, res) => {
  const cached = db
    .prepare("SELECT status FROM report_cache WHERE type = 'packaging_analysis'")
    .get() as { status: string } | undefined;

  if (cached?.status === 'running')
    return res.json({ status: 'running', message: 'Already running' });

  setImmediate(() => computePackagingAnalysis());
  res.json({ status: 'running', message: 'Analysis started' });
});

router.get('/packaging-analysis/export', (_req, res) => {
  const cached = db
    .prepare(
      "SELECT payload, computed_at FROM report_cache WHERE type = 'packaging_analysis' AND status = 'ready'"
    )
    .get() as { payload: string; computed_at: string } | undefined;

  if (!cached)
    return res.status(400).json({ error: 'No analysis available. Run the report first.' });

  const report: PackagingAnalysisReport = JSON.parse(cached.payload);
  const wb = XLSX.utils.book_new();

  // Sheet 1: Packaging Utilization
  const headers1 = [
    'Packaging', 'Type', 'Fits (Products)', 'Best Fit (Products)', 'Sole Option',
    'Avg Utilization (%)', 'Exact Fit', 'Good Fit', 'Loose Fit', 'Oversized',
  ];
  const rows1 = report.packaging_stats.map(s => [
    s.packaging.name,
    s.packaging.type.replace(/_/g, ' '),
    s.fits_count,
    s.best_fit_count,
    s.sole_option ? 'YES' : 'No',
    s.avg_utilization ?? '',
    s.fit_quality_counts.exact,
    s.fit_quality_counts.good,
    s.fit_quality_counts.loose,
    s.fit_quality_counts.large,
  ]);
  const ws1 = XLSX.utils.aoa_to_sheet([headers1, ...rows1]);
  ws1['!cols'] = [
    { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
    { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Packaging Utilization');

  // Sheet 2: Coverage Gaps
  const headers2 = ['Issue', 'Product ID', 'Name', 'H (in)', 'W (in)', 'L (in)', 'Weight (lbs)', 'Foldable', 'Ships Own'];
  const rows2 = [
    ...report.no_fit_products.map(p => [
      'No Packaging Found', p.id, p.name, p.height, p.width, p.length, p.weight,
      p.foldable ? 'Yes' : 'No', p.ships_in_own_packaging ? 'Yes' : 'No',
    ]),
    ...report.loose_only_products.map(p => [
      'Only Loose/Oversized Fits', p.id, p.name, p.height, p.width, p.length, p.weight,
      p.foldable ? 'Yes' : 'No', p.ships_in_own_packaging ? 'Yes' : 'No',
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet([headers2, ...(rows2.length ? rows2 : [['No gaps found']])]);
  ws2['!cols'] = [
    { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Coverage Gaps');

  // Sheet 3: Product Matrix
  const headers3 = [
    'Product ID', 'Name', 'H (in)', 'W (in)', 'L (in)', 'Weight (lbs)',
    'Foldable', 'Ships Own', 'Compatible Options', 'Best Packaging',
    'Fit Quality', 'Vol Utilization (%)', 'Actual Weight (lbs)', 'DIM Weight (lbs)', 'DIM Exposed',
  ];
  const rows3 = report.product_results.map(p => [
    p.id, p.name, p.height, p.width, p.length, p.weight,
    p.foldable ? 'Yes' : 'No',
    p.ships_in_own_packaging ? 'Yes' : 'No',
    p.compatible_count,
    p.best_packaging_name ?? 'None',
    p.fit_quality ?? 'N/A',
    p.volume_utilization ?? '',
    p.actual_weight ?? '',
    p.dim_weight ?? '',
    p.dim_exposed ? 'YES' : 'No',
  ]);
  const ws3 = XLSX.utils.aoa_to_sheet([headers3, ...rows3]);
  ws3['!cols'] = [
    { wch: 16 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 30 }, { wch: 12 },
    { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Product Matrix');

  const dateStr = new Date(report.computed_at).toISOString().split('T')[0];
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="packaging-analysis-${dateStr}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

export default router;
