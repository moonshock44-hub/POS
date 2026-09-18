/**
 * ReceiptModal — post-sale ticket for Forge POS checkout.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   sale: null | {
 *     id?: string
 *     created_at?: string | Date
 *     created_by?: string
 *     // Primary (Sombra POST /api/sales):
 *     lines?: Array<{ product_id?, qty, price, line_total?, name? }>
 *     // Alias for Forge:
 *     items?: Array<{ name, quantity, unit_price, line_total? }>
 *     subtotal?: number
 *     total: number
 *     payment_method?: 'cash' | 'card' | string
 *     amount_paid?: number
 *     amount_due?: number
 *     payment_status?: 'paid' | 'partial'
 *     change?: number
 *     customer_phone?: string  // digits for wa.me; optional
 *   }
 *
 * Print: #receipt-print-area + @media print (index.css).
 * WhatsApp: https://wa.me/<phone>?text=<encoded Spanish summary>
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { X, Printer, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

function formatMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '$0.00'
  return `$${v.toFixed(2)}`
}

function formatQty(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  if (Number.isInteger(v) || Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v))
  return String(Number(v.toFixed(2)))
}

function formatDateTime(value) {
  if (!value) return '—'
  try {
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleString('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return String(value)
  }
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

/** Normalize Sombra `lines` or Forge `items` into a common row shape. */
export function normalizeSaleLines(sale) {
  if (!sale) return []
  if (Array.isArray(sale.lines) && sale.lines.length) {
    return sale.lines.map((ln) => {
      const qty = Number(ln.qty ?? ln.quantity) || 0
      const unitPrice = Number(ln.price ?? ln.unit_price) || 0
      const lineTotal =
        ln.line_total != null
          ? Number(ln.line_total)
          : Math.round(qty * unitPrice * 100) / 100
      return {
        name: ln.name || `Producto ${ln.product_id || ''}`.trim(),
        quantity: qty,
        unit_price: unitPrice,
        line_total: lineTotal,
        product_id: ln.product_id,
      }
    })
  }
  if (Array.isArray(sale.items) && sale.items.length) {
    return sale.items.map((it) => {
      const qty = Number(it.quantity ?? it.qty) || 0
      const unitPrice = Number(it.unit_price ?? it.price) || 0
      const lineTotal =
        it.line_total != null
          ? Number(it.line_total)
          : Math.round(qty * unitPrice * 100) / 100
      return {
        name: it.name || 'Producto',
        quantity: qty,
        unit_price: unitPrice,
        line_total: lineTotal,
        product_id: it.product_id,
      }
    })
  }
  return []
}

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function buildWhatsAppText(sale, lines) {
  const rows = lines
    .map(
      (ln) =>
        `• ${ln.name} x${formatQty(ln.quantity)} — ${formatMoney(ln.line_total)}`
    )
    .join('\n')
  const parts = [
    '*POS Tienditas — Ticket*',
    sale?.id ? `Folio: ${sale.id}` : null,
    `Fecha: ${formatDateTime(sale?.created_at)}`,
    '',
    rows || '(sin artículos)',
    '',
    `Total: ${formatMoney(sale?.total)}`,
    sale?.payment_method
      ? `Pago: ${paymentMethodLabel(sale.payment_method)}`
      : null,
    sale?.amount_paid != null ? `Pagado: ${formatMoney(sale.amount_paid)}` : null,
    sale?.amount_due != null ? `Pendiente: ${formatMoney(sale.amount_due)}` : null,
    sale?.payment_status
      ? `Estado: ${paymentStatusLabel(sale.payment_status)}`
      : null,
    sale?.change != null && Number(sale.change) > 0
      ? `Cambio: ${formatMoney(sale.change)}`
      : null,
    '',
    '¡Gracias por su compra!',
  ]
  return parts.filter((p) => p != null).join('\n')
}

export default function ReceiptModal({ open, onClose, sale }) {
  const titleId = useId()
  const [phone, setPhone] = useState('')

  const lines = useMemo(() => normalizeSaleLines(sale), [sale])

  useEffect(() => {
    if (!open) return
    setPhone(digitsOnly(sale?.customer_phone))
  }, [open, sale?.customer_phone])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !sale) return null

  const waPhone = digitsOnly(phone)
  const canWhatsApp = waPhone.length >= 10
  const status = String(sale.payment_status || '').toLowerCase()
  const isPartial = status === 'partial' || status === 'parcial'

  const handlePrint = () => {
    window.print()
  }

  const handleWhatsApp = () => {
    if (!canWhatsApp) return
    const text = buildWhatsAppText(sale, lines)
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
    <style>{`@media print {
  body * { visibility: hidden !important; }
  #receipt-print-area, #receipt-print-area * { visibility: visible !important; }
  #receipt-print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 12px !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    background: white !important;
  }
  .receipt-modal-chrome { display: none !important; }
}`}</style>
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 receipt-modal-chrome"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] receipt-modal-chrome"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl brutal-border brutal-shadow-lg bg-cream">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b-[3px] border-ink bg-cream px-5 py-4 receipt-modal-chrome">
          <h2 id={titleId} className="font-display text-xl">
            Ticket de venta
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar diálogo"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-4 p-5">
          <div
            id="receipt-print-area"
            className="rounded-xl brutal-border bg-white px-4 py-5 font-sans text-ink"
          >
            <div className="text-center border-b-[3px] border-dashed border-ink pb-3 mb-3">
              <p className="font-display text-xl tracking-tight">POS Tienditas</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-ink/60">
                Comprobante de venta
              </p>
              {sale.id && (
                <p className="mt-1 text-xs font-medium text-ink/70">
                  Folio: {sale.id}
                </p>
              )}
              <p className="mt-0.5 text-xs font-medium text-ink/70">
                {formatDateTime(sale.created_at)}
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
                    </p>
                  </div>
                  <p className="shrink-0 font-bold tabular-nums">
                    {formatMoney(ln.line_total)}
                  </p>
                </li>
              ))}
              {lines.length === 0 && (
                <li className="text-sm text-ink/50 font-medium">Sin artículos</li>
              )}
            </ul>

            <div className="mt-4 space-y-1.5 border-t-[3px] border-ink pt-3">
              {sale.subtotal != null && (
                <div className="flex justify-between text-sm font-medium">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(sale.subtotal)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="font-display text-lg">Total</span>
                <span className="font-display text-2xl tabular-nums">
                  {formatMoney(sale.total)}
                </span>
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
                    <span className="tabular-nums">
                      {formatMoney(sale.amount_paid)}
                    </span>
                  </div>
                )}
                {sale.amount_due != null && (
                  <div className="flex justify-between gap-2">
                    <span className="text-ink/70">Monto pendiente</span>
                    <span className="tabular-nums">
                      {formatMoney(sale.amount_due)}
                    </span>
                  </div>
                )}
                {sale.payment_status != null && sale.payment_status !== '' && (
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-ink/70">Estado</span>
                    <Badge
                      className={
                        isPartial ? 'bg-lemon normal-case' : 'bg-mint normal-case'
                      }
                    >
                      {paymentStatusLabel(sale.payment_status)}
                    </Badge>
                  </div>
                )}
                {sale.change != null && Number(sale.change) > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-ink/70">Cambio</span>
                    <span className="tabular-nums font-bold">
                      {formatMoney(sale.change)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-4 text-center text-xs font-bold text-ink/50">
              ¡Gracias por su compra!
            </p>
          </div>

          <div className="space-y-2 receipt-modal-chrome">
            <Label htmlFor="receipt-phone">WhatsApp del cliente</Label>
            <Input
              id="receipt-phone"
              type="tel"
              inputMode="tel"
              placeholder="5215512345678"
              value={phone}
              onChange={(e) => setPhone(digitsOnly(e.target.value))}
            />
            {!canWhatsApp && (
              <p className="text-[11px] font-medium text-ink/50">
                Ingresa un teléfono con al menos 10 dígitos (código de país + número)
                para enviar por WhatsApp.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1 receipt-modal-chrome">
            <Button
              type="button"
              variant="lemon"
              className="flex-1"
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <Button
              type="button"
              variant="mint"
              className="flex-1"
              disabled={!canWhatsApp}
              onClick={handleWhatsApp}
              title={
                canWhatsApp
                  ? 'Abrir WhatsApp con resumen del ticket'
                  : 'Necesitas un teléfono válido'
              }
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
