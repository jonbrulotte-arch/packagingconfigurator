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
  notes: string | null;
  active: number;
  created_at?: string;
  updated_at?: string;
}

export interface ConfiguratorResult {
  packaging: Packaging;
  actual_weight: number;
  dim_weight: number;
  weight_flag: boolean;
  max_weight_flag: boolean;
  volume_utilization: number;
  fit_quality: 'exact' | 'good' | 'snug' | 'large';
  products_fit: boolean;
}

export interface Settings {
  dim_divisor: number;
  pack_efficiency: number;
  weight_unit: string;
  dim_unit: string;
}
