import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/configurator', label: 'Configurator' },
  { to: '/manual', label: 'Manual' },
  { to: '/bulk', label: 'Bulk' },
  { to: '/products', label: 'Products' },
  { to: '/packaging', label: 'Packaging' },
  { to: '/shipping', label: 'Shipping' },
  { to: '/settings', label: 'Settings' },
  { to: '/reports', label: 'Reports' },
  { to: '/instructions', label: 'Instructions' },
  { to: '/api-docs', label: 'API Docs' },
];

export default function Layout() {
  const { isProtected, authenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleNavClick = (to: string) => {
    setMenuOpen(false);
    navigate(to);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <span className="font-bold text-lg tracking-tight flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-6 h-6 flex-shrink-0">
                <text y=".9em" fontSize="90">📦</text>
              </svg>
              Packaging Configurator
            </span>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
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

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded text-blue-100 hover:bg-brand-700 transition-colors"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-brand-700 bg-brand-800">
            <nav className="max-w-7xl mx-auto px-4 py-2 flex flex-col">
              {navItems.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `px-4 py-3 rounded text-sm font-medium transition-colors ${
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
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="mt-1 px-4 py-3 text-left text-sm font-medium text-blue-200 hover:bg-brand-700 hover:text-white rounded transition-colors"
                >
                  Lock
                </button>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
