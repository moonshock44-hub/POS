import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  Pencil,
  RefreshCw,
  Banknote,
  Receipt,
  Users,
} from 'lucide-react'
import { customersApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CustomerDialog from '@/components/CustomerDialog'
import PaymentDialog from '@/components/PaymentDialog'

function formatMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return String(iso)
  }
}

/** Normalize account payload: open_sales | sales, payments | abonos */
function normalizeAccount(data) {
  if (!data || typeof data !== 'object') {
    return { customer: null, balance: 0, open_sales: [], payments: [] }
  }
  const customer = data.customer || null
  const open_sales = Array.isArray(data.open_sales)
    ? data.open_sales
    : Array.isArray(data.sales)
      ? data.sales
      : []
  const payments = Array.isArray(data.payments)
    ? data.payments
    : Array.isArray(data.abonos)
      ? data.abonos
      : []
  const balance =
    data.balance != null
      ? Number(data.balance)
      : customer?.balance != null
        ? Number(customer.balance)
        : open_sales.reduce((s, x) => s + Number(x.amount_due || 0), 0)
  return { customer, balance, open_sales, payments }
}

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const data = await customersApi.account(id)
      setAccount(normalizeAccount(data))
    } catch (err) {
      setError(err.message || 'No se pudo cargar la cuenta')
      setAccount(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const customer = account?.customer
  const balance = account?.balance ?? 0
  const openSales = account?.open_sales ?? []
  const payments = account?.payments ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/clientes')}>
          <ArrowLeft className="h-4 w-4" />
          Clientes
        </Button>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-xl brutal-border bg-coral/30 px-4 py-3 text-sm font-bold flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl brutal-border brutal-shadow bg-white/80 p-10 text-center font-display text-xl text-ink/50">
          Cargando cuenta…
        </div>
      )}

      {!loading && customer && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-lavender px-2 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border">
                <Users className="h-3 w-3" />
                Cuenta corriente
              </div>
              <h1 className="font-display text-4xl md:text-5xl">{customer.name}</h1>
              <p className="mt-2 text-ink/70 font-medium">
                {customer.phone}
                {customer.email ? ` · ${customer.email}` : ''}
              </p>
              {customer.notes && (
                <p className="mt-1 text-sm text-ink/50 font-medium max-w-xl">{customer.notes}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              <Button
                variant="mint"
                onClick={() => setPayOpen(true)}
                disabled={!(Number(balance) > 0)}
              >
                <Banknote className="h-4 w-4" />
                Registrar abono
              </Button>
            </div>
          </div>

          <Card
            className={
              Number(balance) > 0 ? 'bg-coral/25 ring-2 ring-coral' : 'bg-mint/30'
            }
          >
            <CardContent className="py-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-ink/50">
                  Saldo
                </div>
                <div className="font-display text-4xl">{formatMoney(balance)}</div>
              </div>
              {customer.active === false && (
                <Badge className="bg-ink/10 normal-case">Inactivo</Badge>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-white/90">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Ventas abiertas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {openSales.length === 0 && (
                  <p className="text-sm font-medium text-ink/50 py-4 text-center">
                    Sin ventas pendientes
                  </p>
                )}
                {openSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="rounded-xl brutal-border bg-cream/80 px-3 py-3 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-lg">
                        {formatMoney(sale.amount_due)}
                      </span>
                      <Badge className="bg-coral normal-case tracking-normal">
                        {sale.payment_status || 'partial'}
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-ink/60">
                      Total {formatMoney(sale.total)} · Pagado{' '}
                      {formatMoney(sale.amount_paid)}
                    </p>
                    <p className="text-[11px] text-ink/40">{formatDate(sale.created_at)}</p>
                    {Array.isArray(sale.lines) && sale.lines.length > 0 && (
                      <ul className="text-[11px] text-ink/50 list-disc pl-4">
                        {sale.lines.slice(0, 4).map((ln, i) => (
                          <li key={i}>
                            {ln.qty} × {formatMoney(ln.price)}
                            {ln.line_total != null ? ` = ${formatMoney(ln.line_total)}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-white/90">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  Historial de abonos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {payments.length === 0 && (
                  <p className="text-sm font-medium text-ink/50 py-4 text-center">
                    Sin abonos registrados
                  </p>
                )}
                {payments.map((p) => {
                  const applied = Array.isArray(p.applied_to)
                    ? p.applied_to
                    : Array.isArray(p.allocations)
                      ? p.allocations
                      : []
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl brutal-border bg-mint/20 px-3 py-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-lg">{formatMoney(p.amount)}</span>
                        <Badge className="bg-sky normal-case tracking-normal">
                          {p.payment_method === 'card' ? 'Tarjeta' : 'Efectivo'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-ink/40">{formatDate(p.created_at)}</p>
                      {p.balance_after != null && (
                        <p className="text-xs font-medium text-ink/60">
                          Saldo después: {formatMoney(p.balance_after)}
                        </p>
                      )}
                      {p.note && (
                        <p className="text-xs text-ink/50 italic">{p.note}</p>
                      )}
                      {applied.length > 0 && (
                        <p className="text-[11px] text-ink/40">
                          Aplicado a:{' '}
                          {applied
                            .map((a) => `${a.sale_id?.slice?.(-6) || a.sale_id} (${formatMoney(a.amount)})`)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!loading && !customer && !error && (
        <Card className="bg-lavender/30">
          <CardContent className="py-10 text-center space-y-3">
            <p className="font-display text-2xl">Cliente no encontrado</p>
            <Link
              to="/clientes"
              className="inline-flex h-11 items-center gap-2 rounded-xl brutal-border brutal-shadow bg-lemon px-5 text-sm font-bold"
            >
              Volver a clientes
            </Link>
          </CardContent>
        </Card>
      )}

      <CustomerDialog
        open={editOpen}
        customer={customer}
        onClose={() => setEditOpen(false)}
        onSaved={load}
      />

      <PaymentDialog
        open={payOpen}
        customerId={id}
        customerName={customer?.name}
        balance={balance}
        onClose={() => setPayOpen(false)}
        onPaid={load}
      />
    </div>
  )
}
