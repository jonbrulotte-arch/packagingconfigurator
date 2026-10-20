import { useState } from 'react';
import { Product } from '../types';

interface Props {
  initial?: Partial<Product>;
  onSubmit: (data: Omit<Product, 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel: () => void;
  isEdit?: boolean;
}

const NUM_FIELDS = ['height', 'width', 'length', 'weight'] as const;

const inputClass = 'h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50';

export default function ProductForm({ initial, onSubmit, onCancel, isEdit }: Props) {
  const [form, setForm] = useState({
    id: initial?.id ?? '',
    name: initial?.name ?? '',
    height: String(initial?.height ?? ''),
    width: String(initial?.width ?? ''),
    length: String(initial?.length ?? ''),
    weight: String(initial?.weight ?? ''),
    foldable: !!(initial?.foldable),
    ships_in_own_packaging: !!(initial?.ships_in_own_packaging),
    upc: initial?.upc ?? '',
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
        ships_in_own_packaging: form.ships_in_own_packaging ? 1 : 0,
        upc: form.upc.trim() || null,
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Product ID</label>
          <input
            value={form.id}
            onChange={set('id')}
            disabled={isEdit}
            required
            placeholder="SKU-001"
            className={inputClass}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Product Name</label>
          <input
            value={form.name}
            onChange={set('name')}
            required
            placeholder="Widget A"
            className={inputClass}
          />
        </div>
        {(['height', 'width', 'length'] as const).map(field => (
          <div key={field}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 capitalize">
              {field} (in)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form[field]}
              onChange={set(field)}
              required
              className={inputClass}
            />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Weight (lbs)</label>
          <input
            type="number"
            step="0.001"
            min="0"
            value={form.weight}
            onChange={set('weight')}
            required
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          UPC <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          value={form.upc ?? ''}
          onChange={set('upc')}
          placeholder="012345678901"
          className={`${inputClass} font-mono`}
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.foldable}
          onChange={setCheck('foldable')}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <span className="text-sm font-medium text-gray-700">Foldable</span>
          <p className="text-xs text-gray-500 mt-0.5">
            Item can be folded in half along its longest dimension. The longest dimension is halved
            and thickness doubles when shipped — always applied to optimize package size.
          </p>
        </div>
      </label>

      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.ships_in_own_packaging}
          onChange={setCheck('ships_in_own_packaging')}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <span className="text-sm font-medium text-gray-700">Ships in Own Packaging</span>
          <p className="text-xs text-gray-500 mt-0.5">
            Product ships in its own retail or manufacturer packaging (e.g., appliances, large equipment).
            DIM weight is calculated using the product's own dimensions — no outer box is selected.
          </p>
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
          {loading ? 'Saving…' : isEdit ? 'Update' : 'Add Product'}
        </button>
      </div>
    </form>
  );
}
