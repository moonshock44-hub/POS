/**
 * F7 Dashboard (JUA-13) — KPIs, series + payment bar charts, product/stock tables.
 * Odysseo canon via dashboardApi.summary + normalizeDashboardSummary.
 * Default range: current calendar month America/Mexico_City.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Calendar,
  LayoutDashboard,
  Package,
  RefreshCw,
  ShoppingBag,
  Wallet,
} from 'lucide-react'
import { dashboardApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const TZ = 'America/Mexico_City'
const DEFAULT_THRESHOLD = 5

function formatMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '$0.00'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

function formatInt(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return new Intl.NumberFormat('es-MX').format(v)
}

/** YYYY-MM-DD in America/Mexico_City for a given Date (or "now"). */
function ymdInTz(date = new Date(), timeZone = TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
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
  // Last day: day 0 of next month in civil calendar (UTC noon trick for length)
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate()
  const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function shortDateLabel(ymd) {
  if (!ymd || typeof ymd !== 'string') return '—'
  const [, m, d] = ymd.split('-')
  if (!m || !d) return ymd
  return `${d}/${m}`
}

function methodLabel(method) {
  const m = String(method || '').toLowerCase()
  if (m === 'cash' || m === 'efectivo') return 'Efectivo'
  if (m === 'card' || m === 'tarjeta') return 'Tarjeta'
  return method || '—'
}

function KpiCard({ title, value, hint, icon: Icon, style }) {
  return (
    <Card className="overflow-hidden" style={style}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 font-bold uppercase tracking-wide text-[11px] text-ink/60">
          {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
          {title}
        </CardDescription>
        <CardTitle className="text-2xl md:text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="pt-0">
          <p className="text-xs font-medium text-ink/60">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}

/** Simple CSS/SVG horizontal-ish vertical bar chart using BrandTheme vars. */
function BarChart({ items, valueKey = 'gross', labelFn, emptyText, colorVar = '--brand-primary' }) {
  const max = useMemo(() => {
    let m = 0
    for (const it of items) {
      const v = Number(it[valueKey]) || 0
      if (v > m) m = v
    }
    return m || 1
  }, [items, valueKey])

  if (!items.length) {
    return (
      <div className="rounded-xl brutal-border bg-white/70 px-4 py-8 text-center text-sm font-medium text-ink/50">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 sm:gap-2 h-44 px-1">
        {items.map((it, i) => {
          const v = Number(it[valueKey]) || 0
          const h = Math.max(v > 0 ? 8 : 2, Math.round((v / max) * 100))
          const label = labelFn ? labelFn(it, i) : it.label || '—'
          return (
            <div
              key={`${label}-${i}`}
              className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1"
              title={`${label}: ${formatMoney(v)}${it.count != null ? ` · ${formatInt(it.count)}` : ''}`}
            >
              <span className="text-[10px] font-bold text-ink/50 tabular-nums truncate max-w-full">
                {v > 0 ? formatMoney(v).replace(/\s/g, '') : ''}
              </span>
              <div
                className="w-full max-w-[48px] mx-auto rounded-t-md brutal-border border-b-0 transition-all"
                style={{
                  height: `${h}%`,
                  backgroundColor: `var(${colorVar})`,
                  minHeight: v > 0 ? 8 : 2,
                }}
              />
              <span className="text-[10px] font-bold text-ink/70 truncate max-w-full">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProductTable({ rows, emptyText, qtyLabel = 'Cant.' }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl brutal-border bg-white/70 px-4 py-6 text-center text-sm font-medium text-ink/50">
        {emptyText}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl brutal-border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-[3px] border-ink bg-cream/80 text-left text-xs uppercase tracking-wide">
            <th className="px-3 py-2 font-bold">Producto</th>
            <th className="px-3 py-2 font-bold">SKU</th>
            <th className="px-3 py-2 font-bold text-right">{qtyLabel}</th>
            <th className="px-3 py-2 font-bold text-right">Ingresos</th>
          </tr>
        </thead>
        <tbody className="divide-y-[2px] divide-ink/10">
          {rows.map((r, i) => (
            <tr key={r.id || `${r.sku}-${i}`} className="hover:bg-lavender/10">
              <td className="px-3 py-2 font-bold">{r.name}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink/60">{r.sku || '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatInt(r.qty)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LowStockTable({ rows, threshold, emptyText }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl brutal-border bg-white/70 px-4 py-6 text-center text-sm font-medium text-ink/50">
        {emptyText}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl brutal-border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-[3px] border-ink bg-cream/80 text-left text-xs uppercase tracking-wide">
            <th className="px-3 py-2 font-bold">Producto</th>
            <th className="px-3 py-2 font-bold">SKU</th>
            <th className="px-3 py-2 font-bold text-right">Stock</th>
            <th className="px-3 py-2 font-bold">Unidad</th>
          </tr>
        </thead>
        <tbody className="divide-y-[2px] divide-ink/10">
          {rows.map((r, i) => (
            <tr key={r.id || `${r.sku}-${i}`} className="hover:bg-coral/10">
              <td className="px-3 py-2 font-bold">{r.name}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink/60">{r.sku || '—'}</td>
              <td className="px-3 py-2 text-right">
                <Badge className={r.stock <= threshold ? 'bg-coral' : 'bg-mint'}>
                  {formatInt(r.stock)}
                </Badge>
              </td>
              <td className="px-3 py-2 text-ink/70">{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Dashboard() {
  const initial = useMemo(() => defaultMonthRange(), [])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [applied, setApplied] = useState(initial)
  const [threshold] = useState(DEFAULT_THRESHOLD)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (range = applied) => {
    setLoading(true)
    setError('')
    try {
      const summary = await dashboardApi.summary({
        from: range.from,
        to: range.to,
        threshold,
      })
      setData(summary)
    } catch (e) {
      setData(null)
      setError(e?.message || 'No se pudo cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }, [applied, threshold])

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
    setApplied({ from, to })
  }

  const onResetMonth = () => {
    const r = defaultMonthRange()
    setFrom(r.from)
    setTo(r.to)
    setApplied(r)
  }

  const k = data?.kpis
  const todayHint = `Hoy · ${ymdInTz()}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl md:text-5xl flex items-center gap-3">
            <LayoutDashboard className="h-9 w-9 shrink-0" />
            Dashboard
          </h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Resumen de ventas, CxC e inventario. Zona horaria {TZ}.
          </p>
        </div>
        <Badge className="bg-sky text-sm py-1">F7 · JUA-13</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Rango de fechas
          </CardTitle>
          <CardDescription>
            Por defecto: mes calendario actual ({TZ}). Query: from, to, threshold={threshold}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onApply} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dash-from">Desde</Label>
              <Input
                id="dash-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[11rem]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dash-to">Hasta</Label>
              <Input
                id="dash-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[11rem]"
              />
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

      {loading && !data ? (
        <div className="rounded-2xl brutal-border brutal-shadow bg-cream/80 px-6 py-16 text-center font-display text-2xl">
          Cargando dashboard…
        </div>
      ) : null}

      {!loading && !error && data && !k?.rangeCount && !k?.todayCount && !k?.monthCount && !data.series.length ? (
        <div className="rounded-2xl brutal-border bg-lavender/20 px-6 py-10 text-center">
          <p className="font-display text-2xl">Sin datos en este rango</p>
          <p className="mt-2 text-sm font-medium text-ink/60">
            Prueba otro periodo o registra ventas en el POS.
          </p>
          <Link
            to="/pos"
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow bg-coral px-5 text-sm font-bold"
          >
            Ir a POS
          </Link>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Ventas hoy"
              value={formatMoney(k.todayGross)}
              hint={`${formatInt(k.todayCount)} tickets · ${todayHint}`}
              icon={ShoppingBag}
              style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 28%, white)' }}
            />
            <KpiCard
              title="Ventas del mes"
              value={formatMoney(k.monthGross)}
              hint={`${formatInt(k.monthCount)} tickets`}
              icon={Calendar}
              style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 35%, white)' }}
            />
            <KpiCard
              title="CxC abierta"
              value={formatMoney(k.cxcBalance)}
              hint={`${formatInt(k.cxcOpen)} cuentas`}
              icon={Wallet}
              style={{ backgroundColor: 'color-mix(in srgb, var(--brand-secondary) 32%, white)' }}
            />
            <KpiCard
              title="Stock bajo"
              value={formatInt(k.lowStock)}
              hint={`Umbral ≤ ${k.lowStockThreshold}`}
              icon={Package}
              style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 18%, #b8f2e6)' }}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              title="Rango · bruto"
              value={formatMoney(k.rangeGross)}
              hint={`${formatInt(k.rangeCount)} ventas · ${applied.from} → ${applied.to}`}
              style={{ backgroundColor: 'color-mix(in srgb, var(--brand-secondary) 20%, white)' }}
            />
            <KpiCard
              title="Rango · cobrado"
              value={formatMoney(k.paid)}
              hint="amount_paid_total"
              style={{ backgroundColor: 'color-mix(in srgb, #b8f2e6 55%, white)' }}
            />
            <KpiCard
              title="Rango · por cobrar"
              value={formatMoney(k.due)}
              hint="amount_due_total"
              style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 22%, white)' }}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Ventas por día</CardTitle>
                <CardDescription>Serie del rango (gross_total)</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChart
                  items={data.series}
                  valueKey="gross"
                  labelFn={(it) => shortDateLabel(it.date)}
                  emptyText="Sin serie diaria en este rango"
                  colorVar="--brand-primary"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Métodos de pago</CardTitle>
                <CardDescription>payment_methods del rango</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChart
                  items={data.paymentMethods}
                  valueKey="gross"
                  labelFn={(it) => methodLabel(it.method)}
                  emptyText="Sin desglose por método de pago"
                  colorVar="--brand-secondary"
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Top productos</CardTitle>
                <CardDescription>Más vendidos en el rango</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductTable
                  rows={data.top}
                  emptyText="Sin productos top en este rango"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Menos vendidos</CardTitle>
                <CardDescription>products.least</CardDescription>
              </CardHeader>
              <CardContent>
                <ProductTable
                  rows={data.least}
                  emptyText="Sin productos least en este rango"
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Inventario · stock bajo
              </CardTitle>
              <CardDescription>
                {formatInt(k.lowStock)} SKUs · umbral {k.lowStockThreshold}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LowStockTable
                rows={data.lowStockItems}
                threshold={k.lowStockThreshold}
                emptyText="No hay productos con stock bajo 🎉"
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
