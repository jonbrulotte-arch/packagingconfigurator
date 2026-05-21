import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Products from './pages/Products';
import Packaging from './pages/Packaging';
import Configurator from './pages/Configurator';
import Settings from './pages/Settings';
import Instructions from './pages/Instructions';
import BulkConfigurator from './pages/BulkConfigurator';
import ApiDocs from './pages/ApiDocs';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/configurator" replace />} />
          <Route path="/products" element={<Products />} />
          <Route path="/packaging" element={<Packaging />} />
          <Route path="/configurator" element={<Configurator />} />
          <Route path="/bulk" element={<BulkConfigurator />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/instructions" element={<Instructions />} />
          <Route path="/api-docs" element={<ApiDocs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
