import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/configurator', label: 'Configurator' },
  { to: '/bulk', label: 'Bulk' },
  { to: '/products', label: 'Products' },
  { to: '/packaging', label: 'Packaging' },
  { to: '/settings', label: 'Settings' },
  { to: '/instructions', label: 'Instructions' },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <span className="font-bold text-lg tracking-tight">Packaging Configurator</span>
            <nav className="flex gap-1">
              {navItems.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `px-4 py-2 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-white text-brand-800'
                        : 'text-blue-100 hover:bg-brand-700 hover:text-white'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
