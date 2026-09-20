import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, TrendingDown, DollarSign, AlertCircle,
  PhoneCall, Users, Droplets, ClipboardList, LogOut, Menu, X
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { toast } from 'sonner'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/aging', icon: TrendingDown, label: 'AR Aging' },
  { to: '/cash-application', icon: DollarSign, label: 'Cash Application' },
  { to: '/disputes', icon: AlertCircle, label: 'Disputes' },
  { to: '/collections', icon: PhoneCall, label: 'Collections' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/liquidity', icon: Droplets, label: 'Liquidity' },
  { to: '/audit', icon: ClipboardList, label: 'Agent Audit' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out')
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-f9-blue flex items-center justify-center">
            <span className="text-white font-bold text-xs">F9</span>
          </div>
          <span className="font-semibold text-slate-900 text-sm">O2C Center</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-blue-50 text-f9-blue font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
              {profile?.full_name?.charAt(0) ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-900 truncate">{profile?.full_name}</p>
              <p className="text-xs text-slate-400 capitalize">{profile?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-500 hover:text-destructive hover:bg-red-50 rounded-lg transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-100 flex items-center px-4 h-14">
        <button onClick={() => setMobileOpen(true)} className="p-1 text-slate-600">
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-3 font-semibold text-sm text-slate-900">O2C Center</span>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl lg:hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <span className="font-semibold text-slate-900">O2C Center</span>
              <button onClick={() => setMobileOpen(false)}><X className="w-5 h-5 text-slate-600" /></button>
            </div>
            <nav className="px-3 py-4 space-y-0.5">
              {NAV.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} end={to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                      isActive ? 'bg-blue-50 text-f9-blue font-medium' : 'text-slate-600 hover:bg-slate-50'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />{label}
                </NavLink>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 overflow-auto lg:pt-0 pt-14">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="h-full"
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}
