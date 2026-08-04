import { ShippingMatch } from '../types';

// Shared shipping-method chip row used by the Configurator and Manual Configurator
// result cards. Shows method · billed weight · rate; the cheapest rated method
// gets a green "Recommended" treatment.
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
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 border text-xs ${
              recommended
                ? 'bg-green-50 border-green-400 ring-1 ring-green-400'
                : 'bg-indigo-50 border-indigo-200'
            }`}
          >
            {recommended && (
              <span className="bg-green-600 text-white font-bold px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide">
                Recommended
              </span>
            )}
            <span className="font-semibold text-gray-800">{sm.method_name}</span>
            <span className="text-gray-400">·</span>
            <span className={`font-medium ${sm.dim_applied ? 'text-amber-600' : 'text-indigo-700'}`}>
              {sm.billed_weight} lbs
            </span>
            {sm.dim_applied && (
              <span className="bg-amber-100 text-amber-700 font-semibold px-1 rounded text-[10px]">DIM</span>
            )}
            <span className="text-gray-400">·</span>
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
