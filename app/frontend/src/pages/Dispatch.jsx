/**
 * F10 Despacho — kanban pendientes | listas (despachoApi → /api/despacho).
 * Spanish UI; BrandTheme / neo-brutal. Not Entregas.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  PackageCheck,
  RefreshCw,
} from 'lucide-react'
import { despachoApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatHour(value) {
  if (!value) return '—'
  try {
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(value)
  }
}

function lineLabel(ln) {
  const name = ln?.name || ln?.product_name || null
  const qty = Number(ln?.qty)
  const qtyStr = Number.isFinite(qty) ? String(qty) : '?'
  if (name) return `${qtyStr}× ${name}`
  const pid = ln?.product_id ? String(ln.product_id) : 'producto'
  const short = pid.length > 8 ? `…${pid.slice(-6)}` : pid
  return `${qtyStr}× ${short}`
}

function itemsSummary(lines) {
  const arr = Array.isArray(lines) ? lines : []
  if (arr.length === 0) return 'Sin artículos'
  const shown = arr.slice(0, 4).map(lineLabel)
  const extra = arr.length > 4 ? ` · +${arr.length - 4} más` : ''
  return shown.join(', ') + extra
}

function OriginBadge({ origin }) {
  const o = String(origin || '').toLowerCase()
  if (o === 'kiosko') {
    return <Badge className="bg-sky">kiosko</Badge>
  }
  if (o === 'caja') {
    return <Badge className="bg-lemon">caja</Badge>
  }
  return <Badge className="bg-lavender">{origin || '—'}</Badge>
}

function DispatchCard({ item, busy, onMove }) {
  const isPending = item.status === 'pending'
  const target = isPending ? 'ready' : 'pending'
  const actionLabel = isPending ? 'Marcar lista' : 'Volver a pendiente'

  return (
    <Card className="bg-white/90 hover:-translate-y-0.5 transition-transform">
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-xl font-mono tracking-tight">
            {item.folio || '—'}
          </CardTitle>
          <OriginBadge origin={item.origin} />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-ink/60 uppercase tracking-wider">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          <span>{formatHour(item.created_at || item.updated_at)}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium text-ink/80 leading-snug">
          {itemsSummary(item.lines)}
        </p>
        {item.sale_id && (
          <p className="text-[10px] font-mono text-ink/40 truncate" title={item.sale_id}>
            venta · {String(item.sale_id).slice(-8)}
          </p>
        )}
        <Button
          size="sm"
          variant={isPending ? 'mint' : 'outline'}
          className="w-full"
          disabled={busy}
          onClick={() => onMove(item, target)}
        >
          <ArrowLeftRight className="h-4 w-4" />
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  )
}

function Column({ title, icon: Icon, badgeClass, items, emptyMsg, busyId, onMove, loading }) {
  return (
    <section className="space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl flex items-center gap-2">
          <Icon className="h-5 w-5" aria-hidden />
          {title}
        </h2>
        <Badge className={`${badgeClass} text-sm py-1`}>{items.length}</Badge>
      </div>
      {loading && items.length === 0 ? (
        <div className="rounded-xl brutal-border bg-white/60 px-4 py-8 text-center text-sm font-bold text-ink/50">
          Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl brutal-border bg-white/60 px-4 py-8 text-center text-sm font-bold text-ink/50">
          {emptyMsg}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <DispatchCard
              key={item.id || item.folio}
              item={item}
              busy={busyId === item.id}
              onMove={onMove}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function Dispatch() {
  const [pending, setPending] = useState([])
  const [ready, setReady] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [p, r] = await Promise.all([
        despachoApi.list({ status: 'pending' }),
        despachoApi.list({ status: 'ready' }),
      ])
      setPending(Array.isArray(p) ? p : [])
      setReady(Array.isArray(r) ? r : [])
    } catch (err) {
      setError(err.message || 'No se pudo cargar el despacho')
      setPending([])
      setReady([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onMove = async (item, status) => {
    if (!item?.id) return
    setBusyId(item.id)
    setError('')
    try {
      await despachoApi.updateStatus(item.id, status)
      await load()
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el estatus')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-mint px-2 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border">
            <PackageCheck className="h-3 w-3" />
            F10 · Despacho
          </div>
          <h1 className="font-display text-4xl md:text-5xl">Despacho</h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Órdenes listas para preparar o entregar en mostrador. Mueve entre pendientes y listas.
            (No es el tablero de entregas a domicilio.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl brutal-border bg-coral/30 px-4 py-3 text-sm font-bold flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Column
          title="Pendientes"
          icon={Clock}
          badgeClass="bg-lemon"
          items={pending}
          emptyMsg="No hay órdenes pendientes"
          busyId={busyId}
          onMove={onMove}
          loading={loading}
        />
        <Column
          title="Listas"
          icon={CheckCircle2}
          badgeClass="bg-mint"
          items={ready}
          emptyMsg="No hay órdenes listas"
          busyId={busyId}
          onMove={onMove}
          loading={loading}
        />
      </div>
    </div>
  )
}
