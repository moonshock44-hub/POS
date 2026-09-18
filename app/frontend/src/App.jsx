import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import BrandTheme from '@/components/BrandTheme'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import Inventory from '@/pages/Inventory'
import Pos from '@/pages/Pos'
import Customers from '@/pages/Customers'
import CustomerDetail from '@/pages/CustomerDetail'
import KioskOrders from '@/pages/KioskOrders'
import Kiosk from '@/pages/Kiosk'
import Deliveries from '@/pages/Deliveries'
import Settings from '@/pages/Settings'
import Dashboard from '@/pages/Dashboard'
import SalesHistory from '@/pages/SalesHistory'
import Dispatch from '@/pages/Dispatch'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-display text-2xl">
        Cargando…
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

/** F10: /despacho only for admin|despacho. Cajero (and others) → /. */
function DespachoRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-display text-2xl">
        Cargando…
      </div>
    )
  }
  const role = user?.role
  if (role === 'admin' || role === 'despacho') return children
  return <Navigate to="/" replace />
}

/**
 * Role despacho: only /despacho — any other protected page redirects there.
 * Admin and cajero pass through.
 */
function DespachoOnlyGuard({ children }) {
  const { user } = useAuth()
  if (user?.role === 'despacho') {
    return <Navigate to="/despacho" replace />
  }
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrandTheme />
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          {/* F4 public kiosk — no ProtectedRoute */}
          <Route path="/kiosko" element={<Kiosk />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route
              path="/"
              element={
                <DespachoOnlyGuard>
                  <Home />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/dashboard"
              element={
                <DespachoOnlyGuard>
                  <Dashboard />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/inventario"
              element={
                <DespachoOnlyGuard>
                  <Inventory />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/pos"
              element={
                <DespachoOnlyGuard>
                  <Pos />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/clientes"
              element={
                <DespachoOnlyGuard>
                  <Customers />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/clientes/:id"
              element={
                <DespachoOnlyGuard>
                  <CustomerDetail />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/pedidos-kiosko"
              element={
                <DespachoOnlyGuard>
                  <KioskOrders />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/entregas"
              element={
                <DespachoOnlyGuard>
                  <Deliveries />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/historial"
              element={
                <DespachoOnlyGuard>
                  <SalesHistory />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/settings"
              element={
                <DespachoOnlyGuard>
                  <Settings />
                </DespachoOnlyGuard>
              }
            />
            <Route
              path="/despacho"
              element={
                <DespachoRoute>
                  <Dispatch />
                </DespachoRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  )
}
