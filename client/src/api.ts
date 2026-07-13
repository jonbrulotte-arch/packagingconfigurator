import { Product, Packaging, AnalyzeResponse, BulkAnalyzeResponse, BulkShipmentResult, Settings, RequestItem, ShippingMethod, ShippingRate, BackupEntry, ReportState, ProductResultEntry, CarrierSkuProduct, AuthUser, UserAccount, ModulePrivileges, SmtpConfig } from './types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const res = await fetch(BASE + url, {
    ...options,
    headers: {
      ...(token ? { 'x-session-token': token } : {}),
      ...options?.headers,
    },
  });
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
export const exportProducts = () => { window.location.href = '/api/products/export'; };

export const importProducts = async (file: File): Promise<{ imported: number; errors: string[] }> => {
  const fd = new FormData();
  fd.append('file', file);
  return request('/products/import', { method: 'POST', body: fd });
};

export const deleteAllProducts = (password: string) =>
  request<{ success: boolean; deleted: number }>('/products/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

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

export const deleteAllPackaging = (password: string) =>
  request<{ success: boolean; deleted: number }>('/packaging/delete-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

// Configurator
export const analyzeProducts = (items: RequestItem[]) =>
  request<AnalyzeResponse>('/configurator/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, best_only: false }),
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

export interface ManualItem {
  name: string;
  height: number;
  width: number;
  length: number;
  weight: number;
  quantity: number;
  foldable: number;
  ships_in_own_packaging: number;
}

export const analyzeManual = (items: ManualItem[]) =>
  request<AnalyzeResponse>('/configurator/analyze-manual', {
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

export const createShippingMethod = (data: Omit<ShippingMethod, 'id'>) =>
  request<ShippingMethod>('/shipping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const updateShippingMethod = (id: number, data: Omit<ShippingMethod, 'id'>) =>
  request<ShippingMethod>(`/shipping/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const deleteShippingMethod = (id: number) =>
  request<{ success: boolean }>(`/shipping/${id}`, { method: 'DELETE' });

// Shipping rate cards
export const getMethodRates = (methodId: number) =>
  request<ShippingRate[]>(`/shipping/${methodId}/rates`);

export const updateMethodRates = (methodId: number, rates: { max_weight: number; rate: number }[]) =>
  request<ShippingRate[]>(`/shipping/${methodId}/rates`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rates }),
  });

export const importShippingRates = async (file: File): Promise<{ imported: number; methods_updated: number; errors: string[] }> => {
  const fd = new FormData();
  fd.append('file', file);
  return request('/shipping/rates/import', { method: 'POST', body: fd });
};

export const exportShippingRates = () => { window.location.href = '/api/shipping/rates/export'; };
export const downloadRatesTemplate = () => { window.location.href = '/api/shipping/rates/template'; };

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

// API Key
export const getApiKeyStatus = () => request<{ active: boolean }>('/auth/api-key');
export const generateApiKey = () => request<{ key: string }>('/auth/api-key/generate', { method: 'POST' });
export const revokeApiKey = () => request<{ success: boolean }>('/auth/api-key', { method: 'DELETE' });

export const verifySession = () =>
  fetch('/api/auth/verify', { headers: authHeaders() })
    .then(r => r.json() as Promise<{ authenticated: boolean; user: AuthUser | null }>);

export const login = async (password: string, email?: string): Promise<{ success: boolean; error?: string }> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(email ? { email, password } : { password }),
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

// Users
export const listUsers = () => request<UserAccount[]>('/users');

export const createUser = (data: { email: string; name?: string; is_admin?: boolean; privileges?: Partial<ModulePrivileges>; send_invite?: boolean }) =>
  request<UserAccount & { invite_sent: boolean; invite_error: string | null }>('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const updateUser = (id: number, data: { name?: string; is_admin?: boolean; active?: boolean; privileges?: Partial<ModulePrivileges> }) =>
  request<UserAccount>(`/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const deleteUser = (id: number) =>
  request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' });

export const setUserPassword = (id: number, newPassword: string) =>
  request<{ success: boolean }>(`/users/${id}/set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });

export const sendUserInvite = (id: number) =>
  request<{ success: boolean }>(`/users/${id}/invite`, { method: 'POST' });

export const getMe = () => request<UserAccount>('/users/me');

export const updateMe = (data: { name?: string; currentPassword?: string; newPassword?: string; salsify_api_key?: string | null }) =>
  request<UserAccount>('/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const forgotPassword = (email: string) =>
  request<{ success: boolean; message: string }>('/users/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

export const resetPassword = (token: string, newPassword: string) =>
  request<{ success: boolean }>('/users/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });

export const acceptInvite = (token: string, newPassword: string) =>
  request<{ success: boolean; email: string }>('/users/accept-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });

// SMTP
export const getSmtpConfig = () => request<SmtpConfig>('/users/smtp');
export const updateSmtpConfig = (data: Partial<SmtpConfig> & { smtp_pass?: string }) =>
  request<{ success: boolean }>('/users/smtp', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
export const testSmtp = (to: string) =>
  request<{ success: boolean }>('/users/smtp/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });

// Backups
export const listBackups = () => request<BackupEntry[]>('/backup');
export const createBackup = () => request<BackupEntry>('/backup', { method: 'POST' });
export const downloadBackup = (filename: string) => { window.location.href = `/api/backup/download/${encodeURIComponent(filename)}`; };
export const restoreBackup = (filename: string) =>
  request<{ success: boolean; message: string }>(`/backup/restore/${encodeURIComponent(filename)}`, { method: 'POST' });
export const deleteBackup = (filename: string) =>
  request<{ success: boolean }>(`/backup/${encodeURIComponent(filename)}`, { method: 'DELETE' });

// Settings
export const getSettings = () => request<Settings>('/configurator/settings');
export const updateSettings = (data: Partial<Settings>) =>
  request<Settings>('/configurator/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

// Reports
export const getPackagingAnalysis = () => request<ReportState>('/reports/packaging-analysis');
export const runPackagingAnalysis = () =>
  request<{ status: string; message: string }>('/reports/packaging-analysis/run', { method: 'POST' });
export const downloadPackagingAnalysisExport = () => {
  window.location.href = '/api/reports/packaging-analysis/export';
};
export const getPackagingSkuReport = (packagingId: number) =>
  request<{ packaging: Packaging; products: ProductResultEntry[] }>(
    `/reports/packaging-analysis/packaging/${packagingId}/products`
  );
export const downloadPackagingSkuExport = (packagingId: number) => {
  window.location.href = `/api/reports/packaging-analysis/packaging/${packagingId}/export`;
};
export const getTypeSkuReport = (type: string) =>
  request<{ type: string; type_label: string; products: ProductResultEntry[] }>(
    `/reports/packaging-analysis/type/${encodeURIComponent(type)}/products`
  );
export const downloadTypeSkuExport = (type: string) => {
  window.location.href = `/api/reports/packaging-analysis/type/${encodeURIComponent(type)}/export`;
};
export const getCarrierDimReport = (methodId: number) =>
  request<{ method_name: string; products: CarrierSkuProduct[] }>(
    `/reports/packaging-analysis/carrier/${methodId}/products`
  );
export const downloadCarrierDimExport = (methodId: number) => {
  window.location.href = `/api/reports/packaging-analysis/carrier/${methodId}/export`;
};
