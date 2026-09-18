/**
 * Cashier page: pending kiosk orders + charge via KioskCheckout → kioskApi.fulfill
 */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, AlertTriangle, TabletSmartphone } from 'lucide-react'
import { kioskApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import KioskCheckout from '@/components/KioskCheckout'
import ReceiptModal from '@/components/ReceiptModal'

function formatMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

function formatWhen(value) {
  if (!value) return '—'
  try {
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return String(value)
  }
}

export default function KioskOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptSale, setReceiptSale] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await kioskApi.listPending()
      const arr = Array.isArray(list) ? list : []
      setOrders(arr)
      setSelectedId((prev) => {
        if (prev && arr.some((o) => o.id === prev)) return prev
        return arr[0]?.id ?? null
      })
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los pedidos del kiosko')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  const selected = orders.find((o) => o.id === selectedId) || null

  const onFulfilled = ({ order, sale }) => {
    const nameById = Object.fromEntries(
      (order?.lines || selected?.lines || []).map((ln) => [
        ln.product_id,
        ln.product_name || ln.name,
      ])
    )
    const enriched = {
      ...sale,
      lines: (sale?.lines || []).map((ln) => ({
        ...ln,
        name: ln.name || nameById[ln.product_id] || `Producto ${ln.product_id || ''}`.trim(),
      })),
      customer_id: sale?.customer_id ?? null,
    }
    setReceiptSale(enriched)
    setReceiptOpen(true)
    setSelectedId(null)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-sky px-2 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border">
            <TabletSmartphone className="h-3 w-3" />
            Kiosko · caja
          </div>
          <h1 className="font-display text-4xl md:text-5xl">Pedidos kiosko</h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Pedidos pendientes del kiosko. Cobra con fulfill (efectivo/tarjeta; crédito parcial
            requiere cliente).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-coral text-sm py-1">
            {orders.length} pendiente{orders.length === 1 ? '' : 's'}
          </Badge>
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

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Pendientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && orders.length === 0 && (
              <p className="text-sm font-bold text-ink/50 py-8 text-center">Cargando…</p>
            )}
            {!loading && orders.length === 0 && (
              <div className="rounded-xl brutal-border bg-sky/15 px-4 py-10 text-center space-y-2">
                <p className="font-display text-xl">Sin pedidos pendientes</p>
                <p className="text-sm font-medium text-ink/60">
                  Cuando un cliente envíe un pedido desde el kiosko, aparecerá aquí.
                </p>
              </div>
            )}
            {orders.map((o) => {
              const active = o.id === selectedId
              const lineCount = Array.isArray(o.lines) ? o.lines.length : 0
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className={`w-full text-left rounded-xl brutal-border px-4 py-3 transition-all focus-brutal ${
                    active ? 'bg-lavender brutal-shadow' : 'bg-white/70 hover:bg-white'
                  }`}
                  aria-pressed={active}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold truncate">
                        {o.customer_name || 'Cliente kiosko'}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-ink/45 mt-0.5">
                        {formatWhen(o.created_at)} · {lineCount} línea{lineCount === 1 ? '' : 's'}
                      </div>
                      {o.note && (
                        <div className="text-xs font-medium text-ink/60 mt-1 truncate">{o.note}</div>
                      )}
                    </div>
                    <div className="font-display text-lg shrink-0">{formatMoney(o.total)}</div>
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <aside>
          <KioskCheckout
            order={selected}
            onSuccess={onFulfilled}
            onCancel={() => setSelectedId(null)}
          />
        </aside>
      </div>

      <ReceiptModal
        open={receiptOpen}
        onClose={() => {
          setReceiptOpen(false)
          setReceiptSale(null)
        }}
        sale={receiptSale}
      />
    </div>
  )
}
