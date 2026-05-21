import { useState } from 'react';
import { Packaging } from '../types';

interface Props {
  initial?: Partial<Packaging>;
  onSubmit: (data: Omit<Packaging, 'id'>) => Promise<void>;
  onCancel: () => void;
  isEdit?: boolean;
}

const TYPES: Packaging['type'][] = ['box', 'bubble_mailer', 'poly_mailer', 'other'];
const TYPE_LABELS: Record<Packaging['type'], string> = {
  box: 'Box',
  bubble_mailer: 'Bubble Mailer',
  poly_mailer: 'Poly Mailer',
  other: 'Other',
};

export default function PackagingForm({ initial, onSubmit, onCancel, isEdit }: Props) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    type: (initial?.type ?? 'box') as Packaging['type'],
    height: String(initial?.height ?? ''),
    width: String(initial?.width ?? ''),
    length: String(initial?.length ?? ''),
    max_weight: String(initial?.max_weight ?? ''),
    packaging_weight: String(initial?.packaging_weight ?? ''),
    notes: initial?.notes ?? '',
    active: initial?.active !== undefined ? initial.active : 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const height = Number(form.height);
    const width = Number(form.width);
    const length = Number(form.length);
    if ([height, width, length].some(n => isNaN(n) || n <= 0)) {
      setError('Dimensions must be valid positive numbers');
      return;
    }
    const max_weight = form.max_weight === '' ? null : Number(form.max_weight);
    if (max_weight !== null && isNaN(max_weight)) {
      setError('Max weight must be a valid number');
      return;
    }
    const packaging_weight = form.packaging_weight === '' ? null : Number(form.packaging_weight);
    if (packaging_weight !== null && isNaN(packaging_weight)) {
      setError('Packaging weight must be a valid number');
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        type: form.type,
        height,
        width,
        length,
        max_weight,
        packaging_weight,
        notes: form.notes.trim() || null,
        active: form.active,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            value={form.name}
            onChange={set('name')}
            required
            placeholder='e.g. "Small Box 6x4x3"'
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={form.type}
            onChange={set('type')}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            {TYPES.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {(['height', 'width', 'length'] as const).map(field => (
          <div key={field}>
            <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
              {field} (in)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form[field]}
              onChange={set(field)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pkg Weight (lbs)</label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={form.packaging_weight}
            onChange={set('packaging_weight')}
            placeholder="Optional"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">Added to product weight when calculating billed weight</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Weight (lbs)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={form.max_weight}
            onChange={set('max_weight')}
            placeholder="Optional"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="Optional notes..."
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={form.active === 1}
            onChange={e => setForm(f => ({ ...f, active: e.target.checked ? 1 : 0 }))}
            className="h-4 w-4 text-brand-600 rounded"
          />
          <label htmlFor="active" className="text-sm text-gray-700">Active (available for recommendations)</label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Saving…' : isEdit ? 'Update' : 'Add Packaging'}
        </button>
      </div>
    </form>
  );
}
