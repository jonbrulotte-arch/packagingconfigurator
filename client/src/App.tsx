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
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginModal from './components/LoginModal';

function ProtectedPage({ children }: { children: React.ReactNode }) {
  const { isProtected, authenticated, loading } = useAuth();
  if (loading) return <div className="text-gray-400 py-8">Loading…</div>;
  if (isProtected && !authenticated) return <LoginModal />;
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
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
