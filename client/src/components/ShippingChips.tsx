import { ShippingMatch } from '../types';

export default function ShippingChips({ shipping }: { shipping: ShippingMatch[] }) {
  if (!shipping || shipping.length === 0) return null;

  let cheapestId: number | null = null;
  let cheapestRate = Infinity;
  for (const sm of shipping) {
    if (sm.rate != null && sm.rate < cheapestRate) {
      cheapestRate = sm.rate;
      cheapestId = sm.method_id;
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {shipping.map(sm => {
        const recommended = sm.method_id === cheapestId;
        return (
          <div
            key={sm.method_id}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border text-xs ${
              recommended
                ? 'bg-green-50 border-green-300 ring-1 ring-green-300'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            {recommended && (
              <span className="inline-flex items-center rounded-full bg-green-600 text-white font-bold px-2 py-0.5 text-[10px] uppercase tracking-wide">
                Recommended
              </span>
            )}
            <span className="font-semibold text-gray-800">{sm.method_name}</span>
            <span className="text-gray-300">·</span>
            <span className={`font-medium ${sm.dim_applied ? 'text-amber-600' : 'text-blue-700'}`}>
              {sm.billed_weight} lbs
            </span>
            {sm.dim_applied && (
              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 text-[10px]">DIM</span>
            )}
            <span className="text-gray-300">·</span>
            {sm.rate != null ? (
              <span className={`font-bold ${recommended ? 'text-green-700' : 'text-gray-700'}`}>
                ${sm.rate.toFixed(2)}
              </span>
            ) : (
              <span className="text-gray-400 italic">no rate</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
