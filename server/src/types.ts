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
  created_at?: string;
  updated_at?: string;
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

export interface Settings {
  dim_divisor: number;
  pack_efficiency: number;
  weight_unit: string;
  dim_unit: string;
}

export interface ShippingMethod {
  id: number;
  name: string;
  min_weight: number;
  max_weight: number | null;
  dim_divisor: number | null;
  dim_threshold: number | null;
  active: number;
  is_ltl: number;
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
