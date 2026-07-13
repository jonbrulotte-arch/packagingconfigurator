import { useEffect, useState } from 'react';

export interface TocItem {
  id: string;
  label: string;
}

export default function TocLayout({ items, children }: { items: TocItem[]; children: React.ReactNode }) {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-10% 0px -75% 0px' }
    );
    items.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex gap-8 items-start">
      <aside className="hidden lg:block w-48 flex-shrink-0">
        <nav className="sticky top-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-3">Contents</p>
          <ul className="space-y-0.5">
            {items.map(({ id, label }) => (
              <li key={id}>
                <button
                  onClick={() => scrollTo(id)}
                  className={`block w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    activeId === id
                      ? 'bg-brand-50 text-brand-700 font-medium border-l-2 border-brand-600'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
