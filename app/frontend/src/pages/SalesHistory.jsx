/**
 * F8 Historial (JUA-16) — sale list + filters + ticket detail.
 * Sombra/Odysseo: GET /api/sales?from&to&payment_method&payment_status&… + GET /api/sales/{id}
 * Default range: current calendar month America/Mexico_City (mirror Dashboard).
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  History,
  RefreshCw,
  Receipt,
  X,
} from 'lucide-react'
import { customersApi, productsApi, salesApi } from '@/lib/api'
import { normalizeSaleLines } from '@/components/ReceiptModal'
import CustomerPicker from '@/components/CustomerPicker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const TZ = 'America/Mexico_City'

const DELIVERY_STATUS_LABEL = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  out: 'En camino',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
}

function formatMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '$0.00'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

function formatQty(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  if (Number.isInteger(v) || Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v))
  return String(Number(v.toFixed(2)))
}

function formatWhen(value) {
  if (!value) return '—'
  try {
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleString('es-MX', {
      timeZone: TZ,
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return String(value)
  }
}

function shortId(id) {
  if (!id) return '—'
  const s = String(id)
  return s.length > 8 ? `…${s.slice(-6)}` : s
}

function paymentMethodLabel(method) {
  const m = String(method || '').toLowerCase()
  if (m === 'cash' || m === 'efectivo') return 'Efectivo'
  if (m === 'card' || m === 'tarjeta') return 'Tarjeta'
  return method || '—'
}

function paymentStatusLabel(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'paid' || s === 'pagado') return 'Pagado'
  if (s === 'partial' || s === 'parcial') return 'Parcial'
  return status || '—'
}

/** First and last day of the calendar month containing `date` in TZ. */
function defaultMonthRange(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value
  const y = get('year')
  const m = get('month')
  const from = `${y}-${m}-01`
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate()
  const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function TicketDetailDialog({ open, onClose, sale, loading, error, productMap, customerMap }) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const lines = useMemo(() => {
    if (!sale) return []
    return normalizeSaleLines(sale).map((ln) => {
      const p = ln.product_id ? productMap[ln.product_id] : null
      return {
        ...ln,
        name: p?.name || ln.name || (ln.product_id ? `Producto ${shortId(ln.product_id)}` : 'Producto'),
        sku: p?.sku || '',
      }
    })
  }, [sale, productMap])

  if (!open) return null

  const status = String(sale?.payment_status || '').toLowerCase()
  const isPartial = status === 'partial' || status === 'parcial'
  const customer = sale?.customer_id ? customerMap[sale.customer_id] : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl brutal-border brutal-shadow-lg bg-cream">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b-[3px] border-ink bg-cream px-5 py-4">
          <h2 id={titleId} className="font-display text-xl flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Ticket
          </h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar diálogo">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-4 p-5">
          {loading && (
            <div className="rounded-xl brutal-border bg-white/70 px-4 py-8 text-center font-medium text-ink/60">
              Cargando ticket…
            </div>
          )}
          {error && !loading && (
            <div className="rounded-xl brutal-border bg-coral/30 px-4 py-3 text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {!loading && !error && sale && (
            <div className="rounded-xl brutal-border bg-white px-4 py-5 font-sans text-ink">
              <div className="text-center border-b-[3px] border-dashed border-ink pb-3 mb-3">
                <p className="font-display text-xl tracking-tight">POS Tienditas</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-ink/60">
                  Comprobante de venta
                </p>
                {sale.id && (
                  <p className="mt-1 text-xs font-medium text-ink/70">Folio: {sale.id}</p>
                )}
                <p className="mt-0.5 text-xs font-medium text-ink/70">
                  {formatWhen(sale.created_at)}
                </p>
              </div>

              <ul className="space-y-2 text-sm">
                {lines.map((ln, i) => (
                  <li
                    key={ln.product_id || `${ln.name}-${i}`}
                    className="flex items-start justify-between gap-2 border-b border-ink/10 pb-2 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug">{ln.name}</p>
                      <p className="text-xs text-ink/60 font-medium">
                        {formatQty(ln.quantity)} × {formatMoney(ln.unit_price)}
                        {ln.sku ? ` · ${ln.sku}` : ''}
                      </p>
                    </div>
                    <p className="shrink-0 font-bold tabular-nums">{formatMoney(ln.line_total)}</p>
                  </li>
                ))}
                {lines.length === 0 && (
                  <li className="text-sm text-ink/50 font-medium">Sin artículos</li>
                )}
              </ul>

              <div className="mt-4 space-y-1.5 border-t-[3px] border-ink pt-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-display text-lg">Total</span>
                  <span className="font-display text-2xl tabular-nums">{formatMoney(sale.total)}</span>
                </div>
                <div className="mt-2 space-y-1 text-sm font-medium">
                  {sale.payment_method != null && sale.payment_method !== '' && (
                    <div className="flex justify-between gap-2">
                      <span className="text-ink/70">Método de pago</span>
                      <span>{paymentMethodLabel(sale.payment_method)}</span>
                    </div>
                  )}
                  {sale.amount_paid != null && (
                    <div className="flex justify-between gap-2">
                      <span className="text-ink/70">Monto pagado</span>
                      <span className="tabular-nums">{formatMoney(sale.amount_paid)}</span>
                    </div>
                  )}
                  {sale.amount_due != null && (
                    <div className="flex justify-between gap-2">
                      <span className="text-ink/70">Monto pendiente</span>
                      <span className="tabular-nums">{formatMoney(sale.amount_due)}</span>
                    </div>
                  )}
                  {sale.payment_status != null && sale.payment_status !== '' && (
                    <div className="flex justify-between gap-2 items-center">
                      <span className="text-ink/70">Estado</span>
                      <Badge className={isPartial ? 'bg-lemon normal-case' : 'bg-mint normal-case'}>
                        {paymentStatusLabel(sale.payment_status)}
                      </Badge>
                    </div>
                  )}
                  {sale.change != null && Number(sale.change) > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="text-ink/70">Cambio</span>
                      <span className="tabular-nums font-bold">{formatMoney(sale.change)}</span>
                    </div>
                  )}
                  {sale.customer_id && (
                    <div className="flex justify-between gap-2">
                      <span className="text-ink/70">Cliente</span>
                      <span className="text-right truncate max-w-[60%]">
                        {customer?.name || shortId(sale.customer_id)}
                      </span>
                    </div>
                  )}
                  {(sale.delivery_status || sale.delivery_driver_id) && (
                    <>
                      {sale.delivery_status && (
                        <div className="flex justify-between gap-2">
                          <span className="text-ink/70">Entrega</span>
                          <span>
                            {DELIVERY_STATUS_LABEL[sale.delivery_status] || sale.delivery_status}
                          </span>
                        </div>
                      )}
                      {sale.delivery_driver_id && (
                        <div className="flex justify-between gap-2">
                          <span className="text-ink/70">Repartidor</span>
                          <span className="font-mono text-xs">{shortId(sale.delivery_driver_id)}</span>
                        </div>
                      )}
                    </>
                  )}
                  {sale.created_by && (
                    <div className="flex justify-between gap-2">
                      <span className="text-ink/70">Cajero</span>
                      <span className="font-mono text-xs">{shortId(sale.created_by)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SalesHistory() {
  const initial = useMemo(() => defaultMonthRange(), [])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [customer, setCustomer] = useState(null)
  const [applied, setApplied] = useState({
    from: initial.from,
    to: initial.to,
    payment_method: '',
    payment_status: '',
    customer_id: '',
  })

  const [sales, setSales] = useState([])
  const [productMap, setProductMap] = useState({})
  const [customerMap, setCustomerMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailSale, setDetailSale] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [products, customers] = await Promise.all([
          productsApi.list({ includeInactive: true }),
          customersApi.list({ includeInactive: true }),
        ])
        if (cancelled) return
        const pm = {}
        for (const p of products || []) {
          if (p?.id) pm[p.id] = p
        }
        const cm = {}
        for (const c of customers || []) {
          if (c?.id) cm[c.id] = c
        }
        setProductMap(pm)
        setCustomerMap(cm)
      } catch {
        /* name resolution is best-effort */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async (range = applied) => {
    setLoading(true)
    setError('')
    try {
      const list = await salesApi.list({
        from: range.from,
        to: range.to,
        payment_method: range.payment_method || undefined,
        payment_status: range.payment_status || undefined,
        customer_id: range.customer_id || undefined,
        limit: 100,
      })
      setSales(Array.isArray(list) ? list : [])
    } catch (e) {
      setSales([])
      setError(e?.message || 'No se pudo cargar el historial')
    } finally {
      setLoading(false)
    }
  }, [applied])

  useEffect(() => {
    load(applied)
  }, [applied, load])

  const onApply = (e) => {
    e?.preventDefault?.()
    if (!from || !to) {
      setError('Elige fecha desde y hasta')
      return
    }
    if (from > to) {
      setError('La fecha desde no puede ser posterior a hasta')
      return
    }
    setApplied({
      from,
      to,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      customer_id: customer?.id || '',
    })
  }

  const onResetMonth = () => {
    const r = defaultMonthRange()
    setFrom(r.from)
    setTo(r.to)
    setPaymentMethod('')
    setPaymentStatus('')
    setCustomer(null)
    setApplied({
      from: r.from,
      to: r.to,
      payment_method: '',
      payment_status: '',
      customer_id: '',
    })
  }

  const openDetail = async (sale) => {
    setDetailOpen(true)
    setDetailSale(sale)
    setDetailError('')
    setDetailLoading(true)
    try {
      const full = await salesApi.get(sale.id)
      setDetailSale(full)
    } catch (e) {
      setDetailError(e?.message || 'No se pudo cargar el ticket')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailSale(null)
    setDetailError('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl md:text-5xl flex items-center gap-3">
            <History className="h-9 w-9 shrink-0" />
            Historial
          </h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Ventas del periodo con filtros y detalle de ticket. Zona horaria {TZ}.
          </p>
        </div>
        <Badge className="bg-lavender text-sm py-1">F8 · JUA-16</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>
            Por defecto: mes calendario actual ({TZ}). Siempre se envían from y to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onApply} className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hist-from">Desde</Label>
                <Input
                  id="hist-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-[11rem]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hist-to">Hasta</Label>
                <Input
                  id="hist-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-[11rem]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hist-method">Método</Label>
                <select
                  id="hist-method"
                  className="flex h-11 w-[10rem] rounded-xl brutal-border bg-cream px-3 text-sm font-bold"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hist-status">Estatus pago</Label>
                <select
                  id="hist-status"
                  className="flex h-11 w-[10rem] rounded-xl brutal-border bg-cream px-3 text-sm font-bold"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="paid">Pagado</option>
                  <option value="partial">Parcial</option>
                </select>
              </div>
              <Button type="submit" variant="primary" disabled={loading}>
                Aplicar
              </Button>
              <Button type="button" variant="outline" onClick={onResetMonth} disabled={loading}>
                Mes actual
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => load(applied)}
                disabled={loading}
                aria-label="Recargar"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Recargar
              </Button>
            </div>
            <div className="max-w-md">
              <CustomerPicker value={customer} onChange={setCustomer} />
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-xl brutal-border bg-coral/30 px-4 py-3 text-sm font-bold flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <Button size="sm" variant="outline" onClick={() => load(applied)}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {loading && sales.length === 0 ? (
        <div className="rounded-2xl brutal-border brutal-shadow bg-cream/80 px-6 py-16 text-center font-display text-2xl">
          Cargando historial…
        </div>
      ) : null}

      {!loading && !error && sales.length === 0 ? (
        <div className="rounded-2xl brutal-border bg-lavender/20 px-6 py-10 text-center">
          <p className="font-display text-2xl">Sin ventas en este rango</p>
          <p className="mt-2 text-sm font-medium text-ink/60">
            Prueba otro periodo o ajusta los filtros.
          </p>
        </div>
      ) : null}

      {sales.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-ink/60">
            {sales.length} venta{sales.length === 1 ? '' : 's'} · {applied.from} → {applied.to}
          </p>
          <div className="grid gap-3">
            {sales.map((sale) => {
              const st = String(sale.payment_status || '').toLowerCase()
              const isPartial = st === 'partial' || st === 'parcial'
              const cust = sale.customer_id ? customerMap[sale.customer_id] : null
              const lineCount = Array.isArray(sale.lines) ? sale.lines.length : 0
              return (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => openDetail(sale)}
                  className="text-left w-full rounded-2xl brutal-border brutal-shadow bg-white/80 px-4 py-4 hover:-translate-y-0.5 transition-transform focus-brutal"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg">Venta {shortId(sale.id)}</span>
                        <Badge
                          className={
                            isPartial ? 'bg-lemon normal-case' : 'bg-mint normal-case'
                          }
                        >
                          {paymentStatusLabel(sale.payment_status)}
                        </Badge>
                        <Badge className="bg-sky/60 normal-case">
                          {paymentMethodLabel(sale.payment_method)}
                        </Badge>
                      </div>
                      <div className="text-xs font-medium text-ink/50">
                        {formatWhen(sale.created_at)}
                        {cust?.name || sale.customer_id
                          ? ` · ${cust?.name || shortId(sale.customer_id)}`
                          : ''}
                        {lineCount ? ` · ${lineCount} línea${lineCount === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                    <div className="font-display text-2xl tabular-nums shrink-0">
                      {formatMoney(sale.total)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <TicketDetailDialog
        open={detailOpen}
        onClose={closeDetail}
        sale={detailSale}
        loading={detailLoading}
        error={detailError}
        productMap={productMap}
        customerMap={customerMap}
      />
    </div>
  )
}
