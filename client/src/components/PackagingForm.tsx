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

const inputClass = 'h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

export default function PackagingForm({ initial, onSubmit, onCancel, isEdit }: Props) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    type: (initial?.type ?? 'box') as Packaging['type'],
    height: String(initial?.height ?? ''),
    width: String(initial?.width ?? ''),
    length: String(initial?.length ?? ''),
    max_weight: String(initial?.max_weight ?? ''),
    max_height: String(initial?.max_height ?? ''),
    packaging_weight: String(initial?.packaging_weight ?? ''),
    notes: initial?.notes ?? '',
    active: initial?.active !== undefined ? initial.active : 1,
  });

  const isMailer = form.type === 'bubble_mailer' || form.type === 'poly_mailer';
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
    const max_height = form.max_height === '' ? null : Number(form.max_height);
    if (max_height !== null && (isNaN(max_height) || max_height <= 0)) {
      setError('Max height must be a valid positive number');
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
        max_height,
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
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
          <input
            value={form.name}
            onChange={set('name')}
            required
            placeholder='e.g. "Small Box 6x4x3"'
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
          <select
            value={form.type}
            onChange={set('type')}
            className={inputClass}
          >
            {TYPES.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {(['height', 'width', 'length'] as const).map(field => (
          <div key={field}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 capitalize">
              {field} (in)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form[field]}
              onChange={set(field)}
              required
              className={inputClass}
            />
          </div>
        ))}

        {isMailer && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Height / Thickness (in)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.max_height}
              onChange={set('max_height')}
              placeholder="Optional"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">Maximum stuffed thickness — used for fit checks and DIM weight instead of H</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Pkg Weight (lbs)</label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={form.packaging_weight}
            onChange={set('packaging_weight')}
            placeholder="Optional"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500">Added to product weight when calculating billed weight</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Weight (lbs)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={form.max_weight}
            onChange={set('max_weight')}
            placeholder="Optional"
            className={inputClass}
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="Optional notes..."
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.active === 1}
          onChange={e => setForm(f => ({ ...f, active: e.target.checked ? 1 : 0 }))}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <span className="text-sm font-medium text-gray-700">Active</span>
          <p className="text-xs text-gray-500 mt-0.5">Available for packaging recommendations</p>
        </div>
      </label>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Saving…' : isEdit ? 'Update' : 'Add Packaging'}
        </button>
      </div>
    </form>
  );
}
