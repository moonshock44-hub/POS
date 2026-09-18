import { useEffect, useId, useState } from 'react'
import { X, Banknote, CreditCard } from 'lucide-react'
import { customersApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function formatMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

/**
 * Registrar abono (FIFO on server).
 * Body: { amount, payment_method: 'cash'|'card', note?: string|null }
 */
export default function PaymentDialog({
  open,
  customerId,
  customerName,
  balance,
  onClose,
  onPaid,
}) {
  const titleId = useId()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setAmount('')
    setMethod('cash')
    setNote('')
    setBusy(false)
    setError('')
  }, [open, customerId])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const onSubmit = async (e) => {
    e.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Ingresa un monto mayor a 0')
      return
    }
    setBusy(true)
    setError('')
    try {
      const receipt = await customersApi.pay(customerId, {
        amount: value,
        payment_method: method,
        note: String(note).trim() || null,
      })
      onPaid?.(receipt)
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo registrar el abono')
    } finally {
      setBusy(false)
    }
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
        onClick={() => !busy && onClose()}
      />
      <div className="relative z-10 w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl brutal-border brutal-shadow-lg bg-cream">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b-[3px] border-ink bg-cream px-5 py-4">
          <div>
            <h2 id={titleId} className="font-display text-xl">
              Registrar abono
            </h2>
            {customerName && (
              <p className="text-xs font-bold text-ink/50 mt-0.5">{customerName}</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar diálogo"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-5">
          {balance != null && Number(balance) > 0 && (
            <div className="rounded-xl brutal-border bg-coral/25 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink/50">
                Saldo pendiente
              </div>
              <div className="font-display text-2xl">{formatMoney(balance)}</div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pay-amount">Monto</Label>
            <Input
              id="pay-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Método</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod('cash')}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border text-sm font-bold transition-all ${
                  method === 'cash'
                    ? 'bg-mint brutal-shadow'
                    : 'bg-white/70 hover:bg-white'
                }`}
              >
                <Banknote className="h-4 w-4" />
                Efectivo
              </button>
              <button
                type="button"
                onClick={() => setMethod('card')}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl brutal-border text-sm font-bold transition-all ${
                  method === 'card'
                    ? 'bg-sky brutal-shadow'
                    : 'bg-white/70 hover:bg-white'
                }`}
              >
                <CreditCard className="h-4 w-4" />
                Tarjeta
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-note">Nota (opcional)</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Abono parcial…"
            />
          </div>

          {error && (
            <div className="rounded-xl brutal-border bg-coral/30 px-3 py-2 text-sm font-bold">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" variant="mint" disabled={busy} className="flex-1">
              {busy ? 'Registrando…' : 'Confirmar abono'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
