import { useState, useEffect } from 'react';
import { Packaging as PkgType } from '../types';
import { getPackaging, createPackaging, updatePackaging, deletePackaging } from '../api';
import Modal from '../components/Modal';
import PackagingForm from '../components/PackagingForm';

const TYPE_LABELS: Record<string, string> = {
  box: 'Box',
  bubble_mailer: 'Bubble Mailer',
  poly_mailer: 'Poly Mailer',
  other: 'Other',
};

const TYPE_COLORS: Record<string, string> = {
  box: 'bg-blue-100 text-blue-800',
  bubble_mailer: 'bg-purple-100 text-purple-800',
  poly_mailer: 'bg-green-100 text-green-800',
  other: 'bg-gray-100 text-gray-700',
};

export default function Packaging() {
  const [items, setItems] = useState<PkgType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PkgType | null>(null);

  const load = async () => {
    try {
      setItems(await getPackaging());
    } catch {
      setError('Failed to load packaging');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (data: Omit<PkgType, 'id'>) => {
    await createPackaging(data);
    setModalOpen(false);
    load();
  };

  const handleEdit = async (data: Omit<PkgType, 'id'>) => {
    await updatePackaging(editTarget!.id, data);
    setEditTarget(null);
    load();
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await deletePackaging(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packaging Options</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} option{items.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700"
        >
          + Add Packaging
        </button>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Type', 'H (in)', 'W (in)', 'L (in)', 'Max H (in)', 'Volume (in³)', 'Pkg Wt (lbs)', 'Max Wt (lbs)', 'Status', 'Notes', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">No packaging configured yet. Add boxes, mailers, etc.</td></tr>
              ) : (
                items.map((pkg, i) => (
                  <tr key={pkg.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{pkg.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[pkg.type] ?? TYPE_COLORS.other}`}>
                        {TYPE_LABELS[pkg.type] ?? pkg.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pkg.height}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pkg.width}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{pkg.length}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {(pkg.type === 'bubble_mailer' || pkg.type === 'poly_mailer') && pkg.max_height != null
                        ? <span className="font-medium text-indigo-700">{pkg.max_height}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {(pkg.height * pkg.width * pkg.length).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pkg.packaging_weight != null ? pkg.packaging_weight : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pkg.max_weight != null ? pkg.max_weight : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${pkg.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {pkg.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{pkg.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-right whitespace-nowrap" colSpan={1}>
                      <button onClick={() => setEditTarget(pkg)} className="text-brand-600 hover:text-brand-800 mr-3">Edit</button>
                      <button onClick={() => handleDelete(pkg.id, pkg.name)} className="text-red-500 hover:text-red-700">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <Modal title="Add Packaging" onClose={() => setModalOpen(false)}>
          <PackagingForm onSubmit={handleAdd} onCancel={() => setModalOpen(false)} />
        </Modal>
      )}
      {editTarget && (
        <Modal title="Edit Packaging" onClose={() => setEditTarget(null)}>
          <PackagingForm initial={editTarget} onSubmit={handleEdit} onCancel={() => setEditTarget(null)} isEdit />
        </Modal>
      )}
    </div>
  );
}
