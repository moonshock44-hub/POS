import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { customersApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  notes: '',
  active: true,
}

export default function CustomerDialog({ open, customer, onClose, onSaved }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isEdit = Boolean(customer?.id)

  useEffect(() => {
    if (!open) return
    setError('')
    setBusy(false)
    if (customer) {
      setForm({
        name: customer.name ?? '',
        phone: customer.phone ?? '',
        email: customer.email ?? '',
        notes: customer.notes ?? '',
        active: customer.active !== false,
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, customer])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    // Never send balance — server-derived
    const payload = {
      name: String(form.name).trim(),
      phone: String(form.phone).trim(),
      email: String(form.email).trim() || null,
      notes: String(form.notes).trim() || null,
      active: Boolean(form.active),
    }
    if (!payload.name) {
      setError('El nombre es obligatorio')
      setBusy(false)
      return
    }
    if (!payload.phone) {
      setError('El teléfono es obligatorio')
      setBusy(false)
      return
    }
    try {
      let saved
      if (isEdit) {
        saved = await customersApi.update(customer.id, payload)
      } else {
        saved = await customersApi.create(payload)
      }
      onSaved?.(saved || { ...payload, id: customer?.id })
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo guardar')
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
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl brutal-border brutal-shadow-lg bg-cream"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b-[3px] border-ink bg-cream px-5 py-4">
          <h2 id={titleId} className="font-display text-xl">
            {isEdit ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
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
          <div className="space-y-2">
            <Label htmlFor="cust-name">Nombre</Label>
            <Input
              id="cust-name"
              value={form.name}
              onChange={setField('name')}
              required
              placeholder="Ej. María López"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cust-phone">Teléfono</Label>
            <Input
              id="cust-phone"
              value={form.phone}
              onChange={setField('phone')}
              required
              placeholder="55 1234 5678"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cust-email">Email (opcional)</Label>
            <Input
              id="cust-email"
              type="email"
              value={form.email}
              onChange={setField('email')}
              placeholder="maria@ejemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cust-notes">Notas (opcional)</Label>
            <Input
              id="cust-notes"
              value={form.notes}
              onChange={setField('notes')}
              placeholder="Cliente frecuente, fiado…"
            />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-2 border-ink"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Cliente activo
            </label>
          )}

          {error && (
            <div className="rounded-xl brutal-border bg-coral/30 px-3 py-2 text-sm font-bold">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={busy} className="flex-1">
              {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
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
