import { useState } from 'react';
import { Product } from '../types';

interface Props {
  initial?: Partial<Product>;
  onSubmit: (data: Omit<Product, 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel: () => void;
  isEdit?: boolean;
}

const NUM_FIELDS = ['height', 'width', 'length', 'weight'] as const;

export default function ProductForm({ initial, onSubmit, onCancel, isEdit }: Props) {
  const [form, setForm] = useState({
    id: initial?.id ?? '',
    name: initial?.name ?? '',
    height: String(initial?.height ?? ''),
    width: String(initial?.width ?? ''),
    length: String(initial?.length ?? ''),
    weight: String(initial?.weight ?? ''),
    foldable: !!(initial?.foldable),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const setCheck = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.checked }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const nums = NUM_FIELDS.map(k => Number(form[k]));
    if (nums.some(n => isNaN(n) || n < 0)) {
      setError('Dimensions and weight must be valid non-negative numbers');
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        id: form.id.trim(),
        name: form.name.trim(),
        height: nums[0],
        width: nums[1],
        length: nums[2],
        weight: nums[3],
        foldable: form.foldable ? 1 : 0,
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
          <input
            value={form.id}
            onChange={set('id')}
            disabled={isEdit}
            required
            placeholder="SKU-001"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
          <input
            value={form.name}
            onChange={set('name')}
            required
            placeholder="Widget A"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        {(['height', 'width', 'length'] as const).map(field => (
          <div key={field}>
            <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
              {field} (in)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form[field]}
              onChange={set(field)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={form.weight}
            onChange={set('weight')}
            required
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.foldable}
          onChange={setCheck('foldable')}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <div>
          <span className="text-sm font-medium text-gray-700">Foldable</span>
          <p className="text-xs text-gray-500 mt-0.5">
            Item can be folded in half along its longest dimension. The longest dimension is halved
            and thickness doubles when shipped — always applied to optimize package size.
          </p>
        </div>
      </label>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Saving…' : isEdit ? 'Update' : 'Add Product'}
        </button>
      </div>
    </form>
  );
}
