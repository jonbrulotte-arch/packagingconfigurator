import { Product, Packaging, AnalyzeResponse, BulkAnalyzeResponse, BulkShipmentResult, Settings, RequestItem } from './types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? 'Request failed');
  }
  return res.json();
}

// Products
export const getProducts = () => request<Product[]>('/products');
export const createProduct = (data: Omit<Product, 'created_at' | 'updated_at'>) =>
  request<Product>('/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
export const updateProduct = (id: string, data: Omit<Product, 'id' | 'created_at' | 'updated_at'>) =>
  request<Product>(`/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
export const deleteProduct = (id: string) =>
  request<{ success: boolean }>(`/products/${id}`, { method: 'DELETE' });
export const importProducts = async (file: File): Promise<{ imported: number; errors: string[] }> => {
  const fd = new FormData();
  fd.append('file', file);
  return request('/products/import', { method: 'POST', body: fd });
};

// Packaging
export const getPackaging = () => request<Packaging[]>('/packaging');
export const createPackaging = (data: Omit<Packaging, 'id'>) =>
  request<Packaging>('/packaging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
export const updatePackaging = (id: number, data: Omit<Packaging, 'id'>) =>
  request<Packaging>(`/packaging/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
export const deletePackaging = (id: number) =>
  request<{ success: boolean }>(`/packaging/${id}`, { method: 'DELETE' });

// Configurator
export const analyzeProducts = (items: RequestItem[]) =>
  request<AnalyzeResponse>('/configurator/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });

export const importConfiguratorFile = async (
  file: File
): Promise<{ items: RequestItem[]; errors: string[] }> => {
  const fd = new FormData();
  fd.append('file', file);
  return request('/configurator/import', { method: 'POST', body: fd });
};

export const downloadConfiguratorTemplate = () => {
  window.location.href = '/api/configurator/template';
};

// Bulk configurator
export const downloadBulkTemplate = () => { window.location.href = '/api/configurator/bulk-template'; };

export const bulkAnalyze = async (file: File): Promise<BulkAnalyzeResponse> => {
  const fd = new FormData();
  fd.append('file', file);
  return request('/configurator/bulk', { method: 'POST', body: fd });
};

export const exportBulkResults = async (shipments: BulkShipmentResult[]) => {
  const res = await fetch('/api/configurator/bulk-export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipments }),
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bulk-results.xlsx';
  a.click();
  URL.revokeObjectURL(url);
};

// Settings
export const getSettings = () => request<Settings>('/configurator/settings');
export const updateSettings = (data: Partial<Settings>) =>
  request<Settings>('/configurator/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
