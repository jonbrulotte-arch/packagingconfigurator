export interface Product {
  id: string;
  name: string;
  height: number;
  width: number;
  length: number;
  weight: number;
  foldable: number;
  ships_in_own_packaging: number;
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
