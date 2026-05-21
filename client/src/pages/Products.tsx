import { useState, useEffect, useRef } from 'react';
import { Product } from '../types';
import { getProducts, createProduct, updateProduct, deleteProduct, importProducts } from '../api';
import Modal from '../components/Modal';
import ProductForm from '../components/ProductForm';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-1">{products.length} product{products.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-3">
          <label className="cursor-pointer px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Excel
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
          </label>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700"
          >
            + Add Product
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          {importMsg}
          {importError && <pre className="mt-1 text-red-600 whitespace-pre-wrap text-xs">{importError}</pre>}
        </div>
      )}
      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Product ID', 'Name', 'H (in)', 'W (in)', 'L (in)', 'Weight (lbs)', 'Volume (in³)', 'Foldable', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No products yet. Add one or import an Excel file.</td></tr>
              ) : (
                products.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-mono font-medium text-brand-700">{p.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{p.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.height}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.width}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.length}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.weight}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {(p.height * p.width * p.length).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {p.foldable ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                          ↕ Yes
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button
                        onClick={() => setEditTarget(p)}
                        className="text-brand-600 hover:text-brand-800 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
        <strong>Excel Import Format:</strong> Columns should be labeled{' '}
        <code>Part Number</code>, <code>Item Name</code>, <code>UPC Height (Inches)</code>,{' '}
        <code>UPC Width (Inches)</code>, <code>UPC Length (Inches)</code>, <code>UPC Weight (Pounds)</code>.{' '}
        Existing products are updated by Part Number.
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
