import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Product } from '../types';
import { getProducts, createProduct, updateProduct, deleteProduct, importProducts, downloadProductsTemplate, exportProducts } from '../api';
import Modal from '../components/Modal';
import ProductForm from '../components/ProductForm';
import { useAuth } from '../contexts/AuthContext';
import { Download, Upload, FileDown, Plus, Search, X, Pencil, Trash2 } from 'lucide-react';

export default function Products() {
  const { authenticated } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = async () => {
    try {
      setProducts(await getProducts());
    } catch {
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Apply deep-link once after products are loaded.
  // Handles both correct (&edit=true) and common typo (?edit=true) URL formats.
  useEffect(() => {
    if (loading) return;
    let productId = searchParams.get('product_id') ?? '';
    let shouldEdit = searchParams.get('edit') === 'true';
    if (!productId) return;

    // If user typed ?product_id=SKU?edit=true (second ? instead of &),
    // the entire "SKU?edit=true" lands as the product_id value — split it out.
    const qIdx = productId.indexOf('?');
    if (qIdx !== -1) {
      const extra = productId.slice(qIdx + 1);
      productId = productId.slice(0, qIdx);
      if (extra.includes('edit=true')) shouldEdit = true;
    }

    setSearchParams({}, { replace: true });
    const found = products.find(p => p.id === productId);
    if (found && shouldEdit) {
      setEditTarget(found);
    } else if (!found) {
      setFilter(productId);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (data: Omit<Product, 'created_at' | 'updated_at'>) => {
    await createProduct(data);
    setModalOpen(false);
    load();
  };

  const handleEdit = async (data: Omit<Product, 'created_at' | 'updated_at'>) => {
    await updateProduct(editTarget!.id, data);
    setEditTarget(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete product "${id}"?`)) return;
    await deleteProduct(id);
    load();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('');
    setImportError('');
    try {
      const result = await importProducts(file);
      setImportMsg(`Imported ${result.imported} product(s).`);
      if (result.errors.length > 0) {
        setImportError(result.errors.join('\n'));
      }
      load();
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const filtered = products.filter(p =>
    !filter || p.id.toLowerCase().includes(filter.toLowerCase()) || p.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filter
              ? `${filtered.length} of ${products.length} product${products.length !== 1 ? 's' : ''}`
              : `${products.length} product${products.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {authenticated && (
            <button
              onClick={downloadProductsTemplate}
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Template
            </button>
          )}
          {authenticated && (
            <label className="cursor-pointer inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors">
              <Upload className="h-4 w-4 mr-1.5" />
              Import
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
            </label>
          )}
          <button
            onClick={exportProducts}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <FileDown className="h-4 w-4 mr-1.5" />
            Export
          </button>
          {authenticated && (
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Product
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
        <strong>Excel Import Format:</strong> Columns:{' '}
        <code className="rounded bg-blue-100 px-1">Part Number</code>,{' '}
        <code className="rounded bg-blue-100 px-1">Item Name</code>,{' '}
        <code className="rounded bg-blue-100 px-1">UPC Height (Inches)</code>,{' '}
        <code className="rounded bg-blue-100 px-1">UPC Width (Inches)</code>,{' '}
        <code className="rounded bg-blue-100 px-1">UPC Length (Inches)</code>,{' '}
        <code className="rounded bg-blue-100 px-1">UPC Weight (Pounds)</code>,{' '}
        <code className="rounded bg-blue-100 px-1">Foldable</code> (0/1),{' '}
        <code className="rounded bg-blue-100 px-1">Ships In Own Packaging</code> (0/1),{' '}
        <code className="rounded bg-blue-100 px-1">UPC</code> (optional barcode).{' '}
        Existing products are updated by Part Number. Use <strong>Export</strong> to download current data for bulk editing.
      </div>

      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by ID or name…"
            className="h-9 w-full rounded-md border border-gray-300 bg-white pl-9 pr-8 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Clear filter"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {importMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {importMsg}
          {importError && <pre className="mt-1 text-red-600 whitespace-pre-wrap text-xs">{importError}</pre>}
        </div>
      )}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">Product ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[130px]">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">H (in)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">W (in)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">L (in)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Wt (lbs)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Vol (in³)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Foldable</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Ships Own</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-gray-400">No products yet. Add one or import an Excel file.</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-gray-400">No products match "{filter}".</td></tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium truncate max-w-[9rem]">
                      <Link
                        to={`/configurator?product_id=${encodeURIComponent(p.id)}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        title={`Open ${p.id} in Configurator`}
                      >
                        {p.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-normal min-w-[130px]">{p.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{p.height}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{p.width}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{p.length}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{p.weight}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(p.height * p.width * p.length).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {p.foldable ? (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800">
                          Yes
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {p.ships_in_own_packaging ? (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800">
                          Yes
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                      {authenticated && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditTarget(p)}
                            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <Modal title="Add Product" onClose={() => setModalOpen(false)}>
          <ProductForm onSubmit={handleAdd} onCancel={() => setModalOpen(false)} />
        </Modal>
      )}
      {editTarget && (
        <Modal title="Edit Product" onClose={() => setEditTarget(null)}>
          <ProductForm initial={editTarget} onSubmit={handleEdit} onCancel={() => setEditTarget(null)} isEdit />
        </Modal>
      )}
    </div>
  );
}
