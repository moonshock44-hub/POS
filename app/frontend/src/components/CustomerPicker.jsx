import { useCallback, useEffect, useState } from 'react'
import { Search, Plus, User, Check } from 'lucide-react'
import { customersApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import CustomerDialog from '@/components/CustomerDialog'

function formatMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

/**
 * Reusable customer select + create for POS checkout (Forge can import).
 * Props:
 *   value: customer object | null
 *   onChange: (customer|null) => void
 *   required?: boolean
 *   className?: string
 */
export default function CustomerPicker({ value, onChange, required = false, className = '' }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await customersApi.list()
      setItems(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar clientes')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = items.filter((c) => {
    if (!q.trim()) return true
    const s = q.trim().toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(s) ||
      (c.phone || '').toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s)
    )
  })

  const onCreated = (saved) => {
    load().then(() => {
      if (saved?.id) onChange?.(saved)
    })
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold uppercase tracking-widest text-ink/50">
          Cliente{required ? ' *' : ''}
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nuevo
        </Button>
      </div>

      {value && (
        <div className="flex items-center justify-between gap-2 rounded-xl brutal-border bg-mint/40 px-3 py-2">
          <div className="min-w-0 flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{value.name}</div>
              <div className="text-xs text-ink/60 truncate">{value.phone}</div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange?.(null)}>
            Quitar
          </Button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre o teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar cliente"
        />
      </div>

      {error && (
        <div className="rounded-xl brutal-border bg-coral/30 px-3 py-2 text-xs font-bold">
          {error}
        </div>
      )}

      <div className="max-h-40 overflow-y-auto rounded-xl brutal-border bg-white/80 divide-y-[2px] divide-ink/10">
        {loading && (
          <div className="px-3 py-4 text-center text-xs font-bold text-ink/40">Cargando…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-xs font-bold text-ink/40">
            Sin clientes
          </div>
        )}
        {!loading &&
          filtered.slice(0, 20).map((c) => {
            const selected = value?.id === c.id
            const owed = Number(c.balance) > 0
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange?.(c)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-lavender/30 focus-brutal ${
                  selected ? 'bg-mint/40' : ''
                }`}
              >
                <User className="h-4 w-4 shrink-0 text-ink/40" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate">{c.name}</div>
                  <div className="text-xs text-ink/50 truncate">{c.phone}</div>
                </div>
                {owed && (
                  <Badge className="bg-coral normal-case tracking-normal shrink-0">
                    {formatMoney(c.balance)}
                  </Badge>
                )}
              </button>
            )
          })}
      </div>

      <CustomerDialog
        open={dialogOpen}
        customer={null}
        onClose={() => setDialogOpen(false)}
        onSaved={onCreated}
      />
    </div>
  )
}
