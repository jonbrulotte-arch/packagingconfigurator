import { useState, useEffect, useRef } from 'react';
import { Packaging as PkgType } from '../types';
import { getPackaging, createPackaging, updatePackaging, deletePackaging, downloadPackagingTemplate, exportPackaging, importPackaging } from '../api';
import Modal from '../components/Modal';
import PackagingForm from '../components/PackagingForm';
import { useAuth } from '../contexts/AuthContext';

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
  const { authenticated } = useAuth();
  const [items, setItems] = useState<PkgType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [importError, setImportError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PkgType | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('');
    setImportError('');
    setError('');
    try {
      const result = await importPackaging(file);
      setImportMsg(`Imported ${result.imported} packaging option${result.imported !== 1 ? 's' : ''}.`);
      if (result.errors.length > 0) setImportError(result.errors.join('\n'));
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packaging Options</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} option{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {authenticated && (
            <button
              onClick={downloadPackagingTemplate}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Template
            </button>
          )}
          {authenticated && (
            <label className="cursor-pointer px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
              </svg>
              Import
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
            </label>
          )}
          <button
            onClick={exportPackaging}
            className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          {authenticated && (
            <button
              onClick={() => setModalOpen(true)}
              className="px-3 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700"
            >
              + Add
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
        <strong>Excel Import Format:</strong> Required columns: <code>Name</code>, <code>Type</code> (box / bubble_mailer / poly_mailer / other),{' '}
        <code>Height (Inches)</code>, <code>Width (Inches)</code>, <code>Length (Inches)</code>.{' '}
        Optional: <code>Max Height (Inches)</code> (mailers), <code>Max Weight (Pounds)</code>,{' '}
        <code>Packaging Weight (Pounds)</code>, <code>Notes</code>, <code>Active</code> (1 or 0).{' '}
        Existing options are updated by Name.
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
          <table className="min-w-full divide-y divide-gray-200 whitespace-nowrap">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[130px]">Name</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Type</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">H</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">W</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">L</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Max H</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Vol (in³)</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Pkg Wt</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Max Wt</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Status</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Notes</th>
                <th className="px-2 py-3 w-20"></th>
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
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 whitespace-normal min-w-[130px]">{pkg.name}</td>
                    <td className="px-3 py-3 text-sm">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[pkg.type] ?? TYPE_COLORS.other}`}>
                        {TYPE_LABELS[pkg.type] ?? pkg.type}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-600">{pkg.height}</td>
                    <td className="px-2 py-3 text-sm text-gray-600">{pkg.width}</td>
                    <td className="px-2 py-3 text-sm text-gray-600">{pkg.length}</td>
                    <td className="px-2 py-3 text-sm text-gray-600">
                      {(pkg.type === 'bubble_mailer' || pkg.type === 'poly_mailer') && pkg.max_height != null
                        ? <span className="font-medium text-indigo-700">{pkg.max_height}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-600">
                      {(pkg.height * pkg.width * pkg.length).toFixed(1)}
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-600">
                      {pkg.packaging_weight != null ? pkg.packaging_weight : '—'}
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-600">
                      {pkg.max_weight != null ? pkg.max_weight : '—'}
                    </td>
                    <td className="px-2 py-3 text-sm">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${pkg.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {pkg.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-500 max-w-[8rem] truncate">{pkg.notes ?? '—'}</td>
                    <td className="px-2 py-3 text-sm text-right whitespace-nowrap">
                      {authenticated && (
                        <>
                          <button onClick={() => setEditTarget(pkg)} className="text-brand-600 hover:text-brand-800 mr-3">Edit</button>
                          <button onClick={() => handleDelete(pkg.id, pkg.name)} className="text-red-500 hover:text-red-700">Delete</button>
                        </>
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
