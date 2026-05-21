import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/configurator', label: 'Configurator' },
  { to: '/bulk', label: 'Bulk' },
  { to: '/products', label: 'Products' },
  { to: '/packaging', label: 'Packaging' },
  { to: '/settings', label: 'Settings' },
  { to: '/instructions', label: 'Instructions' },
  { to: '/api-docs', label: 'API Docs' },
];

export default function Layout() {
  const { isProtected, authenticated, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <span className="font-bold text-lg tracking-tight">Packaging Configurator</span>
            <nav className="flex items-center gap-1">
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
              {isProtected && authenticated && (
                <button
                  onClick={logout}
                  className="ml-2 px-3 py-1.5 text-xs font-medium text-blue-200 border border-blue-400/40 rounded hover:bg-brand-700 hover:text-white transition-colors"
                >
                  Lock
                </button>
              )}
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
