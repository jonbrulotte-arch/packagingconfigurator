import { Product, Packaging, AnalyzeResponse, Settings } from './types';

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
export const analyzeProducts = (product_ids: string[]) =>
  request<AnalyzeResponse>('/configurator/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_ids }),
  });

// Settings
export const getSettings = () => request<Settings>('/configurator/settings');
export const updateSettings = (data: Partial<Settings>) =>
  request<Settings>('/configurator/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
