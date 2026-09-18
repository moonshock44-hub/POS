/**
 * DriverPicker — optional repartidor select for POS checkout (Forge F5 / JUA-12).
 * Lists active drivers from GET /api/deliveries (drivers CRUD).
 *
 * Props:
 *   value: driver object | null
 *   onChange: (driver|null) => void
 *   className?: string
 */
import { useCallback, useEffect, useState } from 'react'
import { Search, Truck, Check } from 'lucide-react'
import { driversApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function DriverPicker({ value, onChange, className = '' }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await driversApi.list()
      setItems(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar repartidores')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = items.filter((d) => {
    if (!q.trim()) return true
    const s = q.trim().toLowerCase()
    return (
      (d.name || '').toLowerCase().includes(s) ||
      (d.phone || '').toLowerCase().includes(s)
    )
  })

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-bold uppercase tracking-widest text-ink/50">
          Repartidor (opcional)
        </label>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange?.(null)}>
            Quitar
          </Button>
        )}
      </div>

      {value && (
        <div className="flex items-center gap-2 rounded-xl brutal-border bg-sky/40 px-3 py-2">
          <Check className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{value.name}</div>
            {value.phone && (
              <div className="text-xs text-ink/60 truncate">{value.phone}</div>
            )}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40" />
        <Input
          className="pl-9"
          placeholder="Buscar repartidor…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar repartidor"
        />
      </div>

      {error && (
        <div className="rounded-xl brutal-border bg-coral/30 px-3 py-2 text-xs font-bold">
          {error}
        </div>
      )}

      <div className="max-h-36 overflow-y-auto rounded-xl brutal-border bg-white/80 divide-y-[2px] divide-ink/10">
        {loading && (
          <div className="px-3 py-4 text-center text-xs font-bold text-ink/40">Cargando…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-xs font-bold text-ink/40">
            Sin repartidores activos
          </div>
        )}
        {!loading &&
          filtered.slice(0, 20).map((d) => {
            const selected = value?.id === d.id
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onChange?.(d)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-lavender/30 ${
                  selected ? 'bg-sky/40' : ''
                }`}
              >
                <Truck className="h-4 w-4 shrink-0 text-ink/40" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate">{d.name}</div>
                  {d.phone && (
                    <div className="text-xs text-ink/50 truncate">{d.phone}</div>
                  )}
                </div>
              </button>
            )
          })}
      </div>
    </div>
  )
}
