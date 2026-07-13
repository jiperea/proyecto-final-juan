import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../features/shell/AppShell';
import { LoginPage } from '../features/auth/LoginPage';
import { OrdersListPage } from '../features/orders/OrdersListPage';
import { ProtectedRoute } from './ProtectedRoute';
import { useBfcacheGuard } from '../app/bfcache';

// Rutas de cliente enlazables (FR-021): /login, /orders, /orders/:id.
export function AppRoutes() {
  useBfcacheGuard();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/orders" replace />} />
        <Route path="/orders" element={<OrdersListPage />} />
        <Route path="/orders/:orderId" element={<OrdersListPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  );
}
