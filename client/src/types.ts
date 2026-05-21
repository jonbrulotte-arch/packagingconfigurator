export interface Product {
  id: string;
  name: string;
  height: number;
  width: number;
  length: number;
  weight: number;
  created_at?: string;
  updated_at?: string;
}

export interface Packaging {
  id: number;
  name: string;
  type: 'box' | 'bubble_mailer' | 'poly_mailer' | 'other';
  height: number;
  width: number;
  length: number;
  max_weight: number | null;
  packaging_weight: number | null;
  notes: string | null;
  active: number;
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
  settings: { dim_divisor: number; pack_efficiency: number };
  results: ConfiguratorResult[];
}

export interface BulkShipmentResult {
  id: string;
  items: ResolvedItem[];
  total_item_count: number;
  total_actual_weight: number;
  results: ConfiguratorResult[];
  best: ConfiguratorResult | null;
  error: string | null;
}

export interface BulkAnalyzeResponse {
  shipments: BulkShipmentResult[];
  parse_errors: string[];
  settings: { dim_divisor: number; pack_efficiency: number };
  summary: { total: number; matched: number; flagged: number; errors: number };
}

export interface Settings {
  dim_divisor: string;
  pack_efficiency: string;
  weight_unit: string;
  dim_unit: string;
}
