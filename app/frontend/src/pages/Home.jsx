import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, ShoppingCart, ArrowRight, Users, MonitorSmartphone, Settings, LayoutDashboard, History, PackageCheck, UserCog } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function Home() {
  const { user } = useAuth()
  const [health, setHealth] = useState(null)

  useEffect(() => {
    authApi.health().then(setHealth).catch((e) => setHealth({ status: 'error', error: e.message }))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl md:text-5xl">¡Hola, {user?.name?.split(' ')[0]}!</h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Fase 10: despacho en mostrador. POS, inventario, clientes e historial listos.
          </p>
        </div>
        <Badge className="bg-sky text-sm py-1">protegido ✓</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">

        <Card className="bg-sky/40 hover:-translate-y-0.5 transition-transform">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5" />
              Dashboard
            </CardTitle>
            <CardDescription>KPIs, gráficas e inventario bajo</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-ink/70 mb-4">
              Ventas de hoy y del mes, CxC, métodos de pago, top productos y stock bajo.
            </p>
            <Link
              to="/dashboard"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow focus-brutal bg-sky px-5 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Ir al dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-blush/40 hover:-translate-y-0.5 transition-transform">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Punto de venta
            </CardTitle>
            <CardDescription>Carrito, cobro y ticket</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-ink/70 mb-4">
              Agrega productos, cobra en efectivo o tarjeta y genera el recibo. Soporta pago parcial
              (crédito).
            </p>
            <Link
              to="/pos"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow focus-brutal bg-coral px-5 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Ir a POS
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-mint/40 hover:-translate-y-0.5 transition-transform">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Package className="h-5 w-5" />
              Inventario
            </CardTitle>
            <CardDescription>Productos, stock e imágenes</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-ink/70 mb-4">
              Alta, edición y soft-delete de productos. Sube imagen a Object Storage y guarda solo{' '}
              <code className="text-xs bg-white px-1 rounded">image_url</code>.
            </p>
            <Link
              to="/inventario"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow focus-brutal bg-lemon px-5 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Ir a inventario
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-lavender/40 hover:-translate-y-0.5 transition-transform">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Users className="h-5 w-5" />
              Clientes
            </CardTitle>
            <CardDescription>Catálogo y cuentas por cobrar</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-ink/70 mb-4">
              Alta de clientes, saldos pendientes y abonos (CxC). Vincula crédito desde el POS.
            </p>
            <Link
              to="/clientes"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow focus-brutal bg-lavender px-5 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Ir a clientes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>


        <Card className="bg-blush/40 hover:-translate-y-0.5 transition-transform">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial
            </CardTitle>
            <CardDescription>Ventas, filtros y tickets</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-ink/70 mb-4">
              Consulta ventas por fecha, método y estatus de pago. Abre el detalle del ticket.
            </p>
            <Link
              to="/historial"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow focus-brutal bg-blush px-5 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Ir a historial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-lemon/40 hover:-translate-y-0.5 transition-transform">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <MonitorSmartphone className="h-5 w-5" />
              Kiosko
            </CardTitle>
            <CardDescription>Autoservicio · pedido a caja</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium text-ink/70 mb-4">
              Pantalla pública para que el cliente arme su pedido y lo envíe a caja. Sin cobro en
              el kiosko.
            </p>
            <Link
              to="/kiosko"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow focus-brutal bg-lemon px-5 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Abrir kiosko
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>



        {(user?.role === 'admin' || user?.role === 'despacho') && (
          <Card className="bg-mint/40 hover:-translate-y-0.5 transition-transform">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <PackageCheck className="h-5 w-5" />
                Despacho
              </CardTitle>
              <CardDescription>Kanban pendientes y listas</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-ink/70 mb-4">
                Prepara órdenes de caja y kiosko. Mueve entre pendientes y listas en mostrador.
              </p>
              <Link
                to="/despacho"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow focus-brutal bg-mint px-5 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                Ir a despacho
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        )}

        {user?.role === 'admin' && (
          <Card className="bg-coral/30 hover:-translate-y-0.5 transition-transform">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuración
              </CardTitle>
              <CardDescription>Negocio, marca, ticket y WhatsApp</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-ink/70 mb-4">
                Ajusta colores de marca, pie de ticket y plantilla de WhatsApp.
              </p>
              <Link
                to="/settings"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow focus-brutal bg-coral px-5 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                Ir a ajustes
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        )}

        {user?.role === 'admin' && (
          <Card className="bg-lavender/40 hover:-translate-y-0.5 transition-transform">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Usuarios
              </CardTitle>
              <CardDescription>Cuentas de cajeros, despacho y admins</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-ink/70 mb-4">
                Crea usuarios con usuario + contraseña y asigna su rol.
              </p>
              <Link
                to="/usuarios"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow focus-brutal bg-lavender px-5 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                Ir a usuarios
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        )}

        <Card className="bg-lavender/30 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">API / health</CardTitle>
            <CardDescription>Mongo + FastAPI</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="rounded-xl brutal-border bg-white p-3 text-xs overflow-auto font-mono">
              {JSON.stringify(health, null, 2)}
            </pre>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => authApi.health().then(setHealth)}
            >
              Re-checar health
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
