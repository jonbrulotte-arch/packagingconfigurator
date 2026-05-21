import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Products from './pages/Products';
import Packaging from './pages/Packaging';
import Configurator from './pages/Configurator';
import Settings from './pages/Settings';
import Instructions from './pages/Instructions';
import BulkConfigurator from './pages/BulkConfigurator';
import ApiDocs from './pages/ApiDocs';
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
            <Route path="/bulk" element={<BulkConfigurator />} />
            <Route path="/instructions" element={<Instructions />} />
            <Route path="/api-docs" element={<ApiDocs />} />
            <Route path="/products" element={<ProtectedPage><Products /></ProtectedPage>} />
            <Route path="/packaging" element={<ProtectedPage><Packaging /></ProtectedPage>} />
            <Route path="/settings" element={<ProtectedPage><Settings /></ProtectedPage>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
