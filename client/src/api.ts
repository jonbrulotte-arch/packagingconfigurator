import { Product, Packaging, AnalyzeResponse, BulkAnalyzeResponse, BulkShipmentResult, Settings, RequestItem, ShippingMethod, ShippingRate } from './types';

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
export const downloadProductsTemplate = () => { window.location.href = '/api/products/template'; };

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

export const downloadPackagingTemplate = () => { window.location.href = '/api/packaging/template'; };

export const exportPackaging = () => { window.location.href = '/api/packaging/export'; };

export const importPackaging = async (file: File): Promise<{ imported: number; errors: string[] }> => {
  const fd = new FormData();
  fd.append('file', file);
  return request('/packaging/import', { method: 'POST', body: fd });
};

// Configurator
export const analyzeProducts = (items: RequestItem[]) =>
  request<AnalyzeResponse>('/configurator/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });

export const exportResults = async (payload: Pick<AnalyzeResponse, 'items' | 'results' | 'settings'>) => {
  const res = await fetch('/api/configurator/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'configurator-results.xlsx';
  a.click();
  URL.revokeObjectURL(url);
};

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
  // Strip the full results[] array — the export only needs best, items, and summary fields.
  // This keeps the payload small even for thousands of shipments.
  const slim = shipments.map(({ results: _r, ...rest }) => rest);
  const res = await fetch('/api/configurator/bulk-export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipments: slim }),
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

// Shipping Methods
export const getShippingMethods = () => request<ShippingMethod[]>('/shipping');

export const createShippingMethod = (data: Omit<ShippingMethod, 'id' | 'rates'>) =>
  request<ShippingMethod>('/shipping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const updateShippingMethod = (id: number, data: Omit<ShippingMethod, 'id' | 'rates'>) =>
  request<ShippingMethod>(`/shipping/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const deleteShippingMethod = (id: number) =>
  request<{ success: boolean }>(`/shipping/${id}`, { method: 'DELETE' });

export const addShippingRate = (methodId: number, data: Pick<ShippingRate, 'max_weight' | 'label'>) =>
  request<ShippingRate>(`/shipping/${methodId}/rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const deleteShippingRate = (rateId: number) =>
  request<{ success: boolean }>(`/shipping/rates/${rateId}`, { method: 'DELETE' });

// Auth
const TOKEN_KEY = 'admin_session_token';

export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const t = getSessionToken();
  return t ? { 'x-session-token': t } : {};
}

export const getAuthStatus = () => request<{ protected: boolean }>('/auth/status');

export const verifySession = () =>
  fetch('/api/auth/verify', { headers: authHeaders() })
    .then(r => r.json() as Promise<{ authenticated: boolean }>);

export const login = async (password: string): Promise<{ success: boolean; error?: string }> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const body = await res.json();
  if (!res.ok) return { success: false, error: body.error };
  if (body.token) localStorage.setItem(TOKEN_KEY, body.token);
  return { success: true };
};

export const logout = async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
  localStorage.removeItem(TOKEN_KEY);
};

export const setPassword = async (newPassword: string, currentPassword?: string): Promise<{ success: boolean; error?: string }> => {
  const res = await fetch('/api/auth/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ newPassword, currentPassword }),
  });
  const body = await res.json();
  if (!res.ok) return { success: false, error: body.error };
  localStorage.removeItem(TOKEN_KEY);
  return { success: true };
};

export const removePassword = async (currentPassword: string): Promise<{ success: boolean; error?: string }> => {
  const res = await fetch('/api/auth/remove-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ currentPassword }),
  });
  const body = await res.json();
  if (!res.ok) return { success: false, error: body.error };
  localStorage.removeItem(TOKEN_KEY);
  return { success: true };
};

// Settings
export const getSettings = () => request<Settings>('/configurator/settings');
export const updateSettings = (data: Partial<Settings>) =>
  request<Settings>('/configurator/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
