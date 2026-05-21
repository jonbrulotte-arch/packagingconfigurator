import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Products from './pages/Products';
import Packaging from './pages/Packaging';
import Configurator from './pages/Configurator';
import Settings from './pages/Settings';
import Instructions from './pages/Instructions';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/configurator" replace />} />
          <Route path="/products" element={<Products />} />
          <Route path="/packaging" element={<Packaging />} />
          <Route path="/configurator" element={<Configurator />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/instructions" element={<Instructions />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
