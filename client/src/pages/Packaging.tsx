import { useState, useEffect, useRef } from 'react';
import { Packaging as PkgType } from '../types';
import { getPackaging, createPackaging, updatePackaging, deletePackaging, downloadPackagingTemplate, exportPackaging, importPackaging } from '../api';
import Modal from '../components/Modal';
import PackagingForm from '../components/PackagingForm';
import { useAuth } from '../contexts/AuthContext';
import { Download, Upload, FileDown, Plus, Pencil, Trash2 } from 'lucide-react';

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
  other: 'bg-gray-100 text-gray-800',
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packaging Options</h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} option{items.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {authenticated && (
            <button
              onClick={downloadPackagingTemplate}
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
            onClick={exportPackaging}
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
              Add
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
        <strong>Excel Import Format:</strong> Required columns:{' '}
        <code className="rounded bg-blue-100 px-1">Name</code>,{' '}
        <code className="rounded bg-blue-100 px-1">Type</code> (box / bubble_mailer / poly_mailer / other),{' '}
        <code className="rounded bg-blue-100 px-1">Height (Inches)</code>,{' '}
        <code className="rounded bg-blue-100 px-1">Width (Inches)</code>,{' '}
        <code className="rounded bg-blue-100 px-1">Length (Inches)</code>.{' '}
        Optional: <code className="rounded bg-blue-100 px-1">Max Height (Inches)</code> (mailers),{' '}
        <code className="rounded bg-blue-100 px-1">Max Weight (Pounds)</code>,{' '}
        <code className="rounded bg-blue-100 px-1">Packaging Weight (Pounds)</code>,{' '}
        <code className="rounded bg-blue-100 px-1">Notes</code>,{' '}
        <code className="rounded bg-blue-100 px-1">Active</code> (1 or 0).{' '}
        Existing options are updated by Name.
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[130px]">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">H</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">W</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-14">L</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Max H</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Vol (in³)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Pkg Wt</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Max Wt</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Notes</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="px-4 py-6 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-6 text-center text-sm text-gray-400">No packaging configured yet. Add boxes, mailers, etc.</td></tr>
              ) : (
                items.map(pkg => (
                  <tr key={pkg.id} className={`border-t border-gray-200 hover:bg-gray-50${!pkg.active ? ' opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-normal min-w-[130px]">{pkg.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_COLORS[pkg.type] ?? TYPE_COLORS.other}`}>
                        {TYPE_LABELS[pkg.type] ?? pkg.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{pkg.height}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{pkg.width}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{pkg.length}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(pkg.type === 'bubble_mailer' || pkg.type === 'poly_mailer') && pkg.max_height != null
                        ? <span className="font-medium text-purple-700">{pkg.max_height}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(pkg.height * pkg.width * pkg.length).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {pkg.packaging_weight != null ? pkg.packaging_weight : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {pkg.max_weight != null ? pkg.max_weight : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${pkg.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {pkg.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[8rem] truncate">{pkg.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                      {authenticated && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditTarget(pkg)}
                            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(pkg.id, pkg.name)}
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
