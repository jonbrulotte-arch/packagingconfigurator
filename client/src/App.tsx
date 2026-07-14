import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Products from './pages/Products';
import Packaging from './pages/Packaging';
import Configurator from './pages/Configurator';
import Settings from './pages/Settings';
import Instructions from './pages/Instructions';
import BulkConfigurator from './pages/BulkConfigurator';
import ApiDocs from './pages/ApiDocs';
import ManualConfigurator from './pages/ManualConfigurator';
import ShippingMethods from './pages/ShippingMethods';
import Reports from './pages/Reports';
import AcceptInvite from './pages/AcceptInvite';
import ResetPassword from './pages/ResetPassword';
import Pricing from './pages/Pricing';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Module } from './types';
import LoginModal from './components/LoginModal';

function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { isProtected, authenticated, loading } = useAuth();
  if (loading) return <div className="text-gray-400 py-8">Loading…</div>;
  if (isProtected && !authenticated) return <LoginModal />;
  return <>{children}</>;
}

// For modules that are restricted by default (e.g. Pricing) — anonymous/unauthenticated
// visitors get the login dialog; signed-in users without the privilege get a clear message.
function ModulePage({ module, children }: { module: Module; children: React.ReactNode }) {
  const { authenticated, loading, canView } = useAuth();
  if (loading) return <div className="text-gray-400 py-8">Loading…</div>;
  if (!authenticated) return <LoginModal />;
  if (!canView(module)) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-lg font-bold text-gray-900 mb-2">Access Restricted</h1>
          <p className="text-sm text-gray-500">
            You don't have access to this module. Ask an administrator to grant you
            view or edit access from Settings → User Accounts.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/configurator" replace />} />
            <Route path="/configurator" element={<Configurator />} />
            <Route path="/manual" element={<ManualConfigurator />} />
            <Route path="/bulk" element={<BulkConfigurator />} />
            <Route path="/instructions" element={<Instructions />} />
            <Route path="/api-docs" element={<ApiDocs />} />
            <Route path="/products" element={<Products />} />
            <Route path="/packaging" element={<Packaging />} />
            <Route path="/shipping" element={<ShippingMethods />} />
            <Route path="/settings" element={<ProtectedPage><Settings /></ProtectedPage>} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/pricing" element={<ModulePage module="pricing"><Pricing /></ModulePage>} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
