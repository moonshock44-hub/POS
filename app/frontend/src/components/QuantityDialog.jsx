/**
 * QuantityDialog — drop-in for Forge POS cart add flow.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   product: { id, name, price, stock, unit?, image_url? } | null
 *   onConfirm: ({ productId, quantity }) => void
 *   initialQuantity?: number  (default 1, or 0.1 for fractional units)
 *
 * Fractional units (kg, L, m, g, ml, …): decimal qty, step 0.01 / stepper 0.1
 * Piece units (pza, pieza, unit, …): integer qty, step 1
 * Clamp: 0 < qty <= stock (stock may be fractional). Confirm disabled if invalid.
 * Shows unit price + live line total (qty * price).
 */
import { useEffect, useId, useMemo, useState } from 'react'
import { X, Minus, Plus, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const FRACTIONAL_UNITS = new Set([
  'kg',
  'g',
  'gr',
  'l',
  'lt',
  'ltr',
  'ml',
  'm',
  'cm',
  'mt',
  'metro',
  'metros',
  'kilo',
  'kilos',
  'litro',
  'litros',
])

function isFractionalUnit(unit) {
  if (!unit) return false
  const u = String(unit).trim().toLowerCase()
  return FRACTIONAL_UNITS.has(u)
}

function formatMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '$0.00'
  return `$${v.toFixed(2)}`
}

function formatQty(n, fractional) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fractional ? '0.00' : '0'
  return fractional ? String(Number(v.toFixed(2))) : String(Math.round(v))
}

function defaultInitial(fractional, initialQuantity) {
  if (initialQuantity != null && Number.isFinite(Number(initialQuantity))) {
    return Number(initialQuantity)
  }
  return fractional ? 0.1 : 1
}

export default function QuantityDialog({
  open,
  onClose,
  product,
  onConfirm,
  initialQuantity,
}) {
  const titleId = useId()
  const fractional = isFractionalUnit(product?.unit)
  const step = fractional ? 0.01 : 1
  const stepperDelta = fractional ? 0.1 : 1
  const maxStock =
    product?.stock != null && Number.isFinite(Number(product.stock))
      ? Number(product.stock)
      : null

  const [quantity, setQuantity] = useState(() =>
    defaultInitial(fractional, initialQuantity)
  )

  useEffect(() => {
    if (!open || !product) return
    const frac = isFractionalUnit(product.unit)
    let q = defaultInitial(frac, initialQuantity)
    const stock =
      product.stock != null && Number.isFinite(Number(product.stock))
        ? Number(product.stock)
        : null
    if (stock != null && stock > 0) {
      q = Math.min(q, stock)
    }
    if (q <= 0) q = frac ? Math.min(0.1, stock ?? 0.1) : 1
    setQuantity(q)
  }, [open, product, initialQuantity])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const lineTotal = useMemo(() => {
    const price = Number(product?.price) || 0
    const q = Number(quantity)
    if (!Number.isFinite(q) || q <= 0) return 0
    return Math.round(q * price * 100) / 100
  }, [product?.price, quantity])

  const valid = useMemo(() => {
    const q = Number(quantity)
    if (!Number.isFinite(q) || q <= 0) return false
    if (maxStock != null && q > maxStock) return false
    if (!fractional && !Number.isInteger(q) && Math.abs(q - Math.round(q)) > 1e-9) {
      return false
    }
    return true
  }, [quantity, maxStock, fractional])

  if (!open || !product) return null

  const unitLabel = product.unit ? String(product.unit) : 'pza'
  const price = Number(product.price) || 0

  const clamp = (raw) => {
    let q = Number(raw)
    if (!Number.isFinite(q)) return quantity
    if (fractional) {
      q = Math.round(q * 100) / 100
    } else {
      q = Math.round(q)
    }
    if (q < 0) q = 0
    if (maxStock != null && q > maxStock) q = maxStock
    return q
  }

  const bump = (delta) => {
    setQuantity((prev) => clamp(Number(prev) + delta))
  }

  const handleConfirm = () => {
    if (!valid) return
    onConfirm?.({ productId: product.id, quantity: Number(quantity) })
    onClose?.()
  }

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
          <h2 id={titleId} className="font-display text-xl">
            Cantidad
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

        <div className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl brutal-border bg-white">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Package className="h-7 w-7 text-ink/30" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg leading-tight truncate">
                {product.name}
              </p>
              <p className="mt-1 text-sm font-bold text-ink/70">
                {formatMoney(price)} / {unitLabel}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge className="bg-mint">
                  Stock: {formatQty(maxStock ?? '—', fractional)} {unitLabel}
                </Badge>
                {fractional && (
                  <Badge className="bg-lavender">Decimal</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qty-input">Cantidad ({unitLabel})</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Disminuir"
                onClick={() => bump(-stepperDelta)}
                disabled={Number(quantity) <= 0}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="qty-input"
                type="number"
                inputMode="decimal"
                min={fractional ? step : 1}
                max={maxStock ?? undefined}
                step={step}
                value={quantity}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '' || raw === '-') {
                    setQuantity(raw === '-' ? raw : '')
                    return
                  }
                  setQuantity(clamp(raw))
                }}
                onBlur={() => {
                  if (quantity === '' || quantity === '-' || !Number.isFinite(Number(quantity))) {
                    setQuantity(defaultInitial(fractional, initialQuantity))
                  } else {
                    setQuantity(clamp(quantity))
                  }
                }}
                className="text-center text-lg font-bold"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Aumentar"
                onClick={() => bump(stepperDelta)}
                disabled={maxStock != null && Number(quantity) >= maxStock}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {!valid && (
              <p className="text-xs font-bold text-danger">
                {maxStock != null && Number(quantity) > maxStock
                  ? `Máximo disponible: ${formatQty(maxStock, fractional)} ${unitLabel}`
                  : 'Ingresa una cantidad válida mayor a 0'}
              </p>
            )}
          </div>

          <div className="rounded-xl brutal-border bg-lemon/40 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink/60">
              Total de línea
            </p>
            <p className="mt-1 font-display text-2xl">
              {formatMoney(lineTotal)}
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink/70">
              {formatMoney(price)} / {unitLabel} · {formatQty(Number(quantity) || 0, fractional)}{' '}
              {unitLabel}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              disabled={!valid}
              onClick={handleConfirm}
            >
              Agregar al carrito
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
