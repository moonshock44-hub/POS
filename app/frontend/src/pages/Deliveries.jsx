/**
 * F5 Entregas — repartidores (driversApi → /api/deliveries) + board de ventas con delivery_*.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Truck, RefreshCw, Plus, AlertTriangle, UserRound } from 'lucide-react'
import { driversApi, salesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const STATUSES = ['pending', 'assigned', 'out', 'delivered', 'cancelled']

const STATUS_LABEL = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  out: 'En camino',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
}

const STATUS_BADGE = {
  pending: 'bg-lemon',
  assigned: 'bg-sky',
  out: 'bg-blush',
  delivered: 'bg-mint',
  cancelled: 'bg-coral',
}

const NEXT = {
  pending: ['assigned', 'cancelled'],
  assigned: ['out', 'cancelled'],
  out: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
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

function shortId(id) {
  if (!id) return '—'
  const s = String(id)
  return s.length > 8 ? `…${s.slice(-6)}` : s
}

function money(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '$0.00'
  return `$${v.toFixed(2)}`
}

const EMPTY_DRIVER = { name: '', phone: '', notes: '', active: true }

export default function Deliveries() {
  const [tab, setTab] = useState('board') // board | drivers
  const [statusFilter, setStatusFilter] = useState('')
  const [sales, setSales] = useState([])
  const [drivers, setDrivers] = useState([])
  const [includeInactive, setIncludeInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [driverForm, setDriverForm] = useState(EMPTY_DRIVER)
  const [editingId, setEditingId] = useState(null)
  const [savingDriver, setSavingDriver] = useState(false)

  const driverMap = useMemo(() => {
    const m = {}
    for (const d of drivers) m[d.id] = d
    return m
  }, [drivers])

  const loadDrivers = useCallback(async () => {
    const list = await driversApi.list({ includeInactive })
    setDrivers(Array.isArray(list) ? list : [])
  }, [includeInactive])

  const loadSales = useCallback(async () => {
    const list = await salesApi.list({
      with_delivery: true,
      delivery_status: statusFilter || undefined,
    })
    setSales(Array.isArray(list) ? list : [])
  }, [statusFilter])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadDrivers(), loadSales()])
    } catch (err) {
      setError(err.message || 'No se pudo cargar entregas')
    } finally {
      setLoading(false)
    }
  }, [loadDrivers, loadSales])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const onStatus = async (sale, status) => {
    setBusyId(sale.id)
    setError('')
    try {
      const body = { delivery_status: status }
      if (status === 'assigned' && !sale.delivery_driver_id && drivers[0]) {
        body.delivery_driver_id = drivers[0].id
      }
      await salesApi.updateDelivery(sale.id, body)
      await loadSales()
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el estatus')
    } finally {
      setBusyId(null)
    }
  }

  const onDriverChange = async (sale, driverId) => {
    setBusyId(sale.id)
    setError('')
    try {
      await salesApi.updateDelivery(sale.id, {
        delivery_driver_id: driverId || null,
        delivery_status: driverId
          ? sale.delivery_status || 'assigned'
          : sale.delivery_status,
      })
      await loadSales()
    } catch (err) {
      setError(err.message || 'No se pudo asignar repartidor')
    } finally {
      setBusyId(null)
    }
  }

  const resetDriverForm = () => {
    setEditingId(null)
    setDriverForm(EMPTY_DRIVER)
  }

  const saveDriver = async (e) => {
    e.preventDefault()
    setSavingDriver(true)
    setError('')
    try {
      const payload = {
        name: driverForm.name.trim(),
        phone: driverForm.phone.trim() || null,
        notes: driverForm.notes.trim() || null,
        active: Boolean(driverForm.active),
      }
      if (!payload.name) throw new Error('Nombre requerido')
      if (editingId) await driversApi.update(editingId, payload)
      else await driversApi.create(payload)
      resetDriverForm()
      await loadDrivers()
    } catch (err) {
      setError(err.message || 'No se pudo guardar repartidor')
    } finally {
      setSavingDriver(false)
    }
  }

  const editDriver = (d) => {
    setEditingId(d.id)
    setDriverForm({
      name: d.name || '',
      phone: d.phone || '',
      notes: d.notes || '',
      active: d.active !== false,
    })
    setTab('drivers')
  }

  const removeDriver = async (d) => {
    if (!confirm(`¿Desactivar a ${d.name}?`)) return
    setError('')
    try {
      await driversApi.remove(d.id)
      await loadDrivers()
    } catch (err) {
      setError(err.message || 'No se pudo desactivar')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-sky px-2 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border">
            <Truck className="h-3 w-3" />
            Entregas · Fase 5
          </div>
          <h1 className="font-display text-4xl md:text-5xl">Entregas</h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Repartidores y estatus de entrega en ventas (`delivery_*`).
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === 'board' ? 'lemon' : 'outline'}
            size="sm"
            onClick={() => setTab('board')}
          >
            Estatus
          </Button>
          <Button
            variant={tab === 'drivers' ? 'lemon' : 'outline'}
            size="sm"
            onClick={() => setTab('drivers')}
          >
            <UserRound className="h-4 w-4" />
            Repartidores
          </Button>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl brutal-border bg-coral/30 p-3 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {tab === 'board' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={!statusFilter ? 'lemon' : 'outline'}
              onClick={() => setStatusFilter('')}
            >
              Todas
            </Button>
            {STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'lemon' : 'outline'}
                onClick={() => setStatusFilter(s)}
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
          </div>

          {loading && <p className="font-medium text-ink/60">Cargando ventas…</p>}
          {!loading && sales.length === 0 && (
            <Card className="bg-sky/20">
              <CardContent className="py-10 text-center space-y-2">
                <p className="font-display text-2xl">Sin entregas</p>
                <p className="text-sm font-medium text-ink/60 max-w-sm mx-auto">
                  No hay ventas con entrega en este filtro. Asigna repartidor en el checkout del POS.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3">
            {sales.map((sale) => {
              const st = sale.delivery_status || 'pending'
              const driver = driverMap[sale.delivery_driver_id]
              const next = NEXT[st] || []
              return (
                <Card key={sale.id} className="bg-white/80">
                  <CardContent className="py-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg">Venta {shortId(sale.id)}</span>
                        <Badge className={STATUS_BADGE[st] || 'bg-lemon'}>
                          {STATUS_LABEL[st] || st}
                        </Badge>
                        <span className="text-sm font-bold">{money(sale.total)}</span>
                      </div>
                      <div className="text-xs font-medium text-ink/50">
                        {formatWhen(sale.created_at)} · repartidor:{' '}
                        {driver?.name || (sale.delivery_driver_id ? shortId(sale.delivery_driver_id) : '—')}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="rounded-xl brutal-border bg-cream px-3 py-2 text-sm font-bold"
                        value={sale.delivery_driver_id || ''}
                        disabled={busyId === sale.id}
                        onChange={(e) => onDriverChange(sale, e.target.value)}
                        aria-label={`Repartidor para venta ${shortId(sale.id)}`}
                      >
                        <option value="">Sin repartidor</option>
                        {drivers
                          .filter((d) => d.active !== false)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                      </select>
                      {next.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant="outline"
                          disabled={busyId === sale.id}
                          onClick={() => onStatus(sale, s)}
                        >
                          → {STATUS_LABEL[s]}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'drivers' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-mint/30">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Plus className="h-5 w-5" />
                {editingId ? 'Editar repartidor' : 'Nuevo repartidor'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={saveDriver}>
                <div>
                  <Label htmlFor="d-name">Nombre</Label>
                  <Input
                    id="d-name"
                    value={driverForm.name}
                    onChange={(e) => setDriverForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="d-phone">Teléfono</Label>
                  <Input
                    id="d-phone"
                    value={driverForm.phone}
                    onChange={(e) => setDriverForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="d-notes">Notas</Label>
                  <Input
                    id="d-notes"
                    value={driverForm.notes}
                    onChange={(e) => setDriverForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={driverForm.active}
                    onChange={(e) => setDriverForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  Activo
                </label>
                <div className="flex gap-2">
                  <Button type="submit" variant="lemon" disabled={savingDriver}>
                    {editingId ? 'Guardar' : 'Crear'}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="outline" onClick={resetDriverForm}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Incluir inactivos
            </label>
            {drivers.map((d) => (
              <Card key={d.id} className="bg-white/80">
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-lg">{d.name}</div>
                    <div className="text-xs font-medium text-ink/50">
                      {d.phone || 'sin tel'} · {d.active === false ? 'inactivo' : 'activo'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => editDriver(d)}>
                      Editar
                    </Button>
                    {d.active !== false && (
                      <Button size="sm" variant="outline" onClick={() => removeDriver(d)}>
                        Desactivar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!loading && drivers.length === 0 && (
              <Card className="bg-lavender/20">
                <CardContent className="py-8 text-center space-y-2">
                  <p className="font-display text-xl">Sin repartidores aún</p>
                  <p className="text-sm font-medium text-ink/60">
                    Crea el primero con el formulario de la izquierda.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
