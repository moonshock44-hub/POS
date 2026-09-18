/**
 * KioskCheckout — cashier charge for a pending kiosk order (Forge / F4).
 *
 * Props:
 *   order: {
 *     id: string
 *     lines: [{ product_id, product_name?, qty, price, line_total? }]
 *     total: number
 *     customer_name?: string | null
 *     note?: string | null
 *   }
 *   onSuccess: ({ order, sale }) => void  — parent opens ReceiptModal
 *   onCancel: () => void
 *   disabled?: boolean
 *
 * Calls kioskApi.fulfill (NOT salesApi).
 * amount_paid defaults to total; CustomerPicker only when partial/crédito.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle, Banknote, CreditCard } from 'lucide-react'
import { kioskApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CustomerPicker from '@/components/CustomerPicker'

function formatMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

function lineTotal(ln) {
  if (ln.line_total != null && Number.isFinite(Number(ln.line_total))) {
    return Number(ln.line_total)
  }
  return Number(ln.qty) * Number(ln.price)
}

export default function KioskCheckout({
  order,
  onSuccess,
  onCancel,
  disabled = false,
}) {
  const [method, setMethod] = useState('cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const lines = Array.isArray(order?.lines) ? order.lines : []
  const total = Number(order?.total)
  const totalOk = Number.isFinite(total) && total >= 0

  useEffect(() => {
    if (!order) {
      setAmountPaid('')
      setSelectedCustomer(null)
      setMethod('cash')
      setError('')
      setSubmitting(false)
      return
    }
    setAmountPaid(String(round2(Number(order.total) || 0)))
    setSelectedCustomer(null)
    setMethod('cash')
    setError('')
    setSubmitting(false)
  }, [order?.id])

  const paidNum = Number(amountPaid)
  const paidValid = amountPaid !== '' && Number.isFinite(paidNum) && paidNum >= 0
  const isCredito = paidValid && totalOk && paidNum < total
  const change = paidValid && totalOk && paidNum >= total ? round2(paidNum - total) : 0
  const amountDue = isCredito ? round2(total - paidNum) : 0

  const canPay =
    !disabled &&
    !submitting &&
    Boolean(order?.id) &&
    lines.length > 0 &&
    totalOk &&
    paidValid &&
    (!isCredito || Boolean(selectedCustomer?.id))

  const onConfirm = async () => {
    if (!canPay) return
    if (isCredito && !selectedCustomer?.id) {
      setError('Selecciona o crea un cliente para venta a crédito')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const body = {
        payment_method: method,
        amount_paid: paidNum,
      }
      if (selectedCustomer?.id) {
        body.customer_id = selectedCustomer.id
      }
      const result = await kioskApi.fulfill(order.id, body)
      onSuccess?.(result)
    } catch (err) {
      setError(err.message || 'No se pudo cobrar el pedido del kiosko')
    } finally {
      setSubmitting(false)
    }
  }

  if (!order) {
    return (
      <Card className="bg-cream/95">
        <CardContent className="p-6 text-sm font-bold text-ink/50">
          Selecciona un pedido pendiente para cobrar.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-cream/95">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">Cobrar pedido</CardTitle>
        <p className="text-xs font-bold text-ink/50 uppercase tracking-widest">
          Kiosko · fulfill
          {order.customer_name ? ` · ${order.customer_name}` : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {lines.map((ln, i) => (
            <li
              key={`${ln.product_id || 'ln'}-${i}`}
              className="rounded-xl brutal-border bg-white/80 px-3 py-2 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">
                  {ln.product_name || ln.name || `Producto ${ln.product_id || ''}`}
                </div>
                <div className="text-[10px] font-bold uppercase text-ink/40">
                  {ln.qty} × {formatMoney(ln.price)}
                </div>
              </div>
              <div className="font-display text-base shrink-0">{formatMoney(lineTotal(ln))}</div>
            </li>
          ))}
        </ul>

        {order.note && (
          <div className="rounded-xl brutal-border bg-sky/20 px-3 py-2 text-sm font-medium">
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink/50 block">
              Nota
            </span>
            {order.note}
          </div>
        )}

        <div className="rounded-xl brutal-border bg-lemon/40 px-3 py-3 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-ink/60">Total</span>
          <span className="font-display text-2xl">{formatMoney(total)}</span>
        </div>

        <div className="space-y-2">
          <Label>Método de pago</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={method === 'cash' ? 'lemon' : 'outline'}
              size="lg"
              className="h-14 text-base"
              onClick={() => setMethod('cash')}
              disabled={submitting || disabled}
            >
              <Banknote className="h-5 w-5" />
              Efectivo
            </Button>
            <Button
              type="button"
              variant={method === 'card' ? 'mint' : 'outline'}
              size="lg"
              className="h-14 text-base"
              onClick={() => setMethod('card')}
              disabled={submitting || disabled}
            >
              <CreditCard className="h-5 w-5" />
              Tarjeta
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="kiosk-amount-paid">Monto pagado</Label>
          <Input
            id="kiosk-amount-paid"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            placeholder="0.00"
            disabled={submitting || disabled}
          />
        </div>

        {paidValid && lines.length > 0 && (
          <div
            className={`rounded-xl brutal-border px-3 py-2 text-sm font-bold ${
              isCredito ? 'bg-coral/25' : 'bg-mint/50'
            }`}
          >
            {isCredito ? (
              <span>Crédito (pendiente): {formatMoney(amountDue)}</span>
            ) : (
              <span>Cambio: {formatMoney(change)}</span>
            )}
          </div>
        )}

        {isCredito && (
          <div className="rounded-xl brutal-border bg-lavender/30 p-3">
            <CustomerPicker
              value={selectedCustomer}
              onChange={(c) => {
                setSelectedCustomer(c)
                if (c) setError('')
              }}
              required={isCredito}
            />
          </div>
        )}

        {error && (
          <div className="rounded-xl brutal-border bg-coral/30 px-4 py-3 text-sm font-bold flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full h-14 text-base"
            disabled={!canPay}
            onClick={onConfirm}
          >
            {submitting
              ? 'Cobrando…'
              : isCredito && !selectedCustomer?.id
                ? 'Selecciona cliente'
                : `Confirmar pago · ${formatMoney(paidValid ? paidNum : total)}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
