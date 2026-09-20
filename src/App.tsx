import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import LoginPage from './pages/LoginPage'
import AppShell from './layouts/AppShell'
import DashboardPage from './pages/DashboardPage'
import AgingPage from './pages/AgingPage'
import CashApplicationPage from './pages/CashApplicationPage'
import DisputesPage from './pages/DisputesPage'
import CollectionsPage from './pages/CollectionsPage'
import CustomersPage from './pages/CustomersPage'
import LiquidityPage from './pages/LiquidityPage'
import AuditPage from './pages/AuditPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <AppShell>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/aging" element={<AgingPage />} />
              <Route path="/cash-application" element={<CashApplicationPage />} />
              <Route path="/disputes" element={<DisputesPage />} />
              <Route path="/collections" element={<CollectionsPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/liquidity" element={<LiquidityPage />} />
              <Route path="/audit" element={<AuditPage />} />
            </Routes>
          </AppShell>
        </ProtectedRoute>
      } />
    </Routes>
  )
}
