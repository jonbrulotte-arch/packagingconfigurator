import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { cn, getInitials } from '../lib/utils';
import {
  Package,
  PenTool,
  Layers,
  ShoppingBag,
  Box,
  Truck,
  DollarSign,
  Settings,
  BarChart3,
  BookOpen,
  Code2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

type NavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  module?: 'pricing';
  admin?: boolean;
};

const navItems: NavItem[] = [
  { to: '/configurator', label: 'Configurator', icon: Package },
  { to: '/manual', label: 'Manual', icon: PenTool },
  { to: '/bulk', label: 'Bulk', icon: Layers },
  { to: '/products', label: 'Products', icon: ShoppingBag },
  { to: '/packaging', label: 'Packaging', icon: Box },
  { to: '/shipping', label: 'Shipping', icon: Truck },
  { to: '/pricing', label: 'Pricing', icon: DollarSign, module: 'pricing' },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

const adminItems: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: Settings, admin: true },
  { to: '/instructions', label: 'Help & Docs', icon: BookOpen },
  { to: '/api-docs', label: 'API Docs', icon: Code2 },
];

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export default function Layout() {
  const { isProtected, authenticated, user, logout, canView } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const visibleNav = navItems.filter(item => !item.module || canView(item.module));
  const visibleAdmin = adminItems;

  const renderItem = ({ to, label, icon: Icon }: NavItem) => (
    <NavLink
      key={to}
      to={to}
      title={collapsed ? label : undefined}
      onClick={() => setMobileOpen(false)}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
        isActive(pathname, to)
          ? 'bg-blue-600 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white',
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );

  const userName = user?.name || user?.email || 'Admin';
  const showAuth = isProtected && authenticated;

  const sidebar = (
    <aside
      className={cn(
        'flex flex-col h-screen bg-gray-900 text-white transition-all duration-200 shrink-0',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-gray-700">
        {collapsed ? (
          <span className="text-lg font-bold text-white mx-auto">P</span>
        ) : (
          <span className="text-lg font-bold text-white tracking-tight">
            Packaging <span className="text-blue-400">Config</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {visibleNav.map(renderItem)}
        {visibleAdmin.length > 0 && (
          <>
            <div className={cn('pt-4 pb-1', collapsed ? 'px-0' : 'px-2')}>
              {!collapsed && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Admin
                </p>
              )}
            </div>
            {visibleAdmin.map(renderItem)}
          </>
        )}
      </nav>

      {/* User block */}
      {showAuth && (
        <div className="border-t border-gray-700 p-3">
          <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
              {getInitials(userName)}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{userName}</p>
                {user?.is_admin && <p className="text-xs text-gray-400 truncate">Admin</p>}
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={logout}
                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex items-center justify-center h-8 border-t border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{sidebar}</div>

      {/* Mobile header + drawer */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-gray-900 flex items-center justify-between px-4 border-b border-gray-700">
        <span className="text-lg font-bold text-white tracking-tight">
          Packaging <span className="text-blue-400">Config</span>
        </span>
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="p-2 rounded text-gray-300 hover:bg-gray-800 transition-colors"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-56">{sidebar}</div>
        </>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
