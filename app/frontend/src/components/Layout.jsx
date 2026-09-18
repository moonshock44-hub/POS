import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Bell,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  PackageCheck,
  Settings,
  ShoppingCart,
  Store,
  TabletSmartphone,
  Truck,
  Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { kioskApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const PENDING_POLL_MS = 8000

const navClass = ({ isActive }) =>
  cn(
    'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-bold brutal-border transition-all focus-brutal whitespace-nowrap',
    isActive
      ? 'brutal-shadow'
      : 'bg-transparent border-transparent hover:bg-white/60'
  )

const NAV = [
  { to: '/dashboard', label: 'Dashboard', short: 'Dash', icon: LayoutDashboard, active: 'bg-lemon' },
  { to: '/pos', label: 'POS', short: 'POS', icon: ShoppingCart, active: 'bg-blush' },
  { to: '/inventario', label: 'Inventario', short: 'Stock', icon: Package, active: 'bg-mint' },
  { to: '/entregas', label: 'Entregas', short: 'Entrega', icon: Truck, active: 'bg-sky' },
  { to: '/clientes', label: 'Clientes', short: 'Clientes', icon: Users, active: 'bg-lavender' },
  { to: '/historial', label: 'Historial', short: 'Historial', icon: History, active: 'bg-blush' },
  { to: '/pedidos-kiosko', label: 'Kiosko', short: 'Kiosko', icon: TabletSmartphone, active: 'bg-sky' },
]

function roleBadgeClass(role) {
  if (role === 'admin') return 'bg-lavender'
  if (role === 'despacho') return 'bg-mint'
  return 'bg-sky'
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(0)
  const isDespachoOnly = user?.role === 'despacho'
  const canDespacho = user?.role === 'admin' || user?.role === 'despacho'

  const refreshPending = useCallback(async () => {
    if (isDespachoOnly) return
    try {
      const n = await kioskApi.pendingCount()
      setPendingCount(typeof n === 'number' && Number.isFinite(n) ? n : 0)
    } catch {
      /* keep last known count on transient errors */
    }
  }, [isDespachoOnly])

  useEffect(() => {
    if (isDespachoOnly) return undefined
    refreshPending()
    const t = setInterval(refreshPending, PENDING_POLL_MS)
    return () => clearInterval(t)
  }, [refreshPending, isDespachoOnly])

  const onLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#contenido-principal"
        className="absolute left-4 top-[-100%] z-50 rounded-xl brutal-border bg-lemon px-4 py-2 font-bold focus:top-4"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-cream/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Link
              to={isDespachoOnly ? '/despacho' : '/'}
              className="flex items-center gap-3 group shrink-0 focus-brutal rounded-xl"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl brutal-border brutal-shadow bg-lemon group-hover:translate-x-[1px] group-hover:translate-y-[1px] group-hover:shadow-none transition-all">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-lg leading-none truncate">POS Tienditas</div>
                <div className="text-xs font-bold text-ink/50 uppercase tracking-widest">
                  {isDespachoOnly ? 'Despacho' : 'Fase 10 · Despacho'}
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {user && (
                <>
                  {!isDespachoOnly && (
                    <Link
                      to="/pedidos-kiosko"
                      className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl brutal-border bg-white hover:bg-sky/30 transition-colors focus-brutal"
                      aria-label={
                        pendingCount > 0
                          ? `${pendingCount} pedidos kiosko pendientes`
                          : 'Pedidos kiosko'
                      }
                      title="Pedidos kiosko pendientes"
                    >
                      <Bell className="h-5 w-5" />
                      {pendingCount > 0 && (
                        <Badge className="bg-coral absolute -top-2 -right-2 min-w-5 h-5 px-1 justify-center text-[10px]">
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </Badge>
                      )}
                    </Link>
                  )}
                  <div className="hidden md:block text-right max-w-[10rem]">
                    <div className="text-sm font-bold truncate">{user.name}</div>
                    <div className="text-xs text-ink/60 truncate">{user.email}</div>
                  </div>
                  <Badge className={roleBadgeClass(user.role)}>{user.role}</Badge>
                  <Button variant="outline" size="sm" onClick={onLogout} aria-label="Cerrar sesión">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Salir</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          <nav
            className="flex items-center gap-1 overflow-x-auto pb-0.5 -mx-1 px-1 [scrollbar-width:thin]"
            aria-label="Navegación principal"
          >
            {/* Role despacho: only Despacho link (minimal chrome) */}
            {isDespachoOnly ? (
              <NavLink
                to="/despacho"
                title="Despacho"
                className={(args) =>
                  cn(navClass(args), args.isActive ? 'bg-mint' : undefined)
                }
              >
                <PackageCheck className="h-4 w-4 shrink-0" aria-hidden />
                <span>Despacho</span>
              </NavLink>
            ) : (
              <>
                {NAV.map(({ to, label, short, icon: Icon, active }) => (
                  <NavLink
                    key={to}
                    to={to}
                    title={label}
                    className={(args) =>
                      cn(navClass(args), args.isActive ? active : undefined)
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="md:hidden">{short}</span>
                    <span className="hidden md:inline">{label}</span>
                  </NavLink>
                ))}
                {canDespacho && (
                  <NavLink
                    to="/despacho"
                    title="Despacho"
                    className={(args) =>
                      cn(navClass(args), args.isActive ? 'bg-mint' : undefined)
                    }
                  >
                    <PackageCheck className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="md:hidden">Desp.</span>
                    <span className="hidden md:inline">Despacho</span>
                  </NavLink>
                )}
                {user?.role === 'admin' && (
                  <NavLink
                    to="/settings"
                    title="Ajustes"
                    className={(args) =>
                      cn(navClass(args), args.isActive ? 'bg-coral' : undefined)
                    }
                  >
                    <Settings className="h-4 w-4 shrink-0" aria-hidden />
                    <span>Ajustes</span>
                  </NavLink>
                )}
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="contenido-principal" className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t-[3px] border-ink/20 py-4 text-center text-xs font-bold text-ink/40 uppercase tracking-widest">
        Neo-brutal pastel · local only
      </footer>
    </div>
  )
}
