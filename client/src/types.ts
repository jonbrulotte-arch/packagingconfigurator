export interface Product {
  id: string;
  name: string;
  height: number;
  width: number;
  length: number;
  weight: number;
  foldable: number;
  ships_in_own_packaging: number;
  upc?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BackupEntry {
  filename: string;
  size: number;
  created_at: string;
}

export interface Packaging {
  id: number;
  name: string;
  type: 'box' | 'bubble_mailer' | 'poly_mailer' | 'other';
  height: number;
  width: number;
  length: number;
  max_weight: number | null;
  max_height: number | null;
  packaging_weight: number | null;
  notes: string | null;
  active: number;
}

export interface ShippingMethod {
  id: number;
  name: string;
  min_weight: number;
  max_weight: number | null;
  dim_divisor: number | null;
  dim_threshold: number | null;
  active: number;
  notes: string | null;
  sort_order: number;
}

export interface ShippingMatch {
  method_id: number;
  method_name: string;
  billed_weight: number;
  dim_applied: boolean;
}

export interface StandaloneResult {
  product: Product;
  quantity: number;
  products_weight: number;
  unit_dim_weight: number;
  unit_billed_weight: number;
  total_billed_weight: number;
  weight_flag: boolean;
  shipping: ShippingMatch[];
}

export interface ConfiguratorResult {
  packaging: Packaging;
  products_weight: number;
  packaging_weight: number;
  total_weight: number;
  dim_weight: number;
  weight_flag: boolean;
  max_weight_flag: boolean;
  volume_utilization: number;
  fit_quality: 'exact' | 'good' | 'loose' | 'large';
  products_fit: boolean;
  has_folded_items: boolean;
  shipping: ShippingMatch[];
  shipped_dims: { height: number; width: number; length: number };
}

export interface RequestItem {
  product_id: string;
  quantity: number;
}

export interface ResolvedItem {
  product: Product;
  quantity: number;
}

export interface AnalyzeResponse {
  items: ResolvedItem[];
  total_actual_weight: number;
  total_item_count: number;
  settings: { dim_divisor: number; pack_efficiency: number; ltl_threshold: number };
  results: ConfiguratorResult[];
  standalone_items: StandaloneResult[];
  ltl_required: boolean;
  ltl_shipping: ShippingMatch[];
}

export interface BulkShipmentResult {
  id: string;
  items: ResolvedItem[];
  total_item_count: number;
  total_actual_weight: number;
  results: ConfiguratorResult[];
  standalone_items: StandaloneResult[];
  best: ConfiguratorResult | null;
  ltl_required: boolean;
  ltl_shipping: ShippingMatch[];
  error: string | null;
}

export interface BulkAnalyzeResponse {
  shipments: BulkShipmentResult[];
  parse_errors: string[];
  settings: { dim_divisor: number; pack_efficiency: number; ltl_threshold: number };
  summary: { total: number; matched: number; flagged: number; ltl: number; errors: number };
}

// ── Packaging Analysis Report ─────────────────────────────────────────────────

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
}

export type ReportState =
  | { status: 'pending' }
  | { status: 'running'; started_at?: string }
  | { status: 'error'; error: string }
  | { status: 'ready'; computed_at: string; data: PackagingAnalysisReport };

// ─────────────────────────────────────────────────────────────────────────────

export interface Settings {
  dim_divisor: string;
  pack_efficiency: string;
  weight_unit: string;
  dim_unit: string;
  ltl_threshold: string;
  backup_frequency?: string;
  backup_hour?: string;
  backup_max_count?: string;
}
