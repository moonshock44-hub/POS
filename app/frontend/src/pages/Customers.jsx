import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  AlertTriangle,
  Pencil,
  Trash2,
  Receipt,
} from 'lucide-react'
import { customersApi, salesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CustomerDialog from '@/components/CustomerDialog'
import PaymentDialog from '@/components/PaymentDialog'

function formatMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return String(iso)
  }
}

export default function Customers() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('clientes') // clientes | cxc
  const [items, setItems] = useState([])
  const [receivables, setReceivables] = useState([])
  const [loading, setLoading] = useState(true)
  const [rxLoading, setRxLoading] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [payOpen, setPayOpen] = useState(false)
  const [payTarget, setPayTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await customersApi.list({ includeInactive })
      setItems(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los clientes')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [includeInactive])

  const loadReceivables = useCallback(async () => {
    setRxLoading(true)
    try {
      const list = await salesApi.receivables()
      setReceivables(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar cuentas por cobrar')
      setReceivables([])
    } finally {
      setRxLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (tab === 'cxc') loadReceivables()
  }, [tab, loadReceivables])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(s) ||
        (c.phone || '').toLowerCase().includes(s) ||
        (c.email || '').toLowerCase().includes(s)
    )
  }, [items, q])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (c, e) => {
    e?.stopPropagation?.()
    setEditing(c)
    setDialogOpen(true)
  }

  const onDelete = async (c, e) => {
    e?.stopPropagation?.()
    const ok = window.confirm(
      `¿Desactivar «${c.name}»? Se marcará como inactivo (soft-delete).`
    )
    if (!ok) return
    setDeletingId(c.id)
    setError('')
    try {
      await customersApi.remove(c.id)
      await load()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  const openPayForSale = (sale) => {
    const cid = sale.customer_id
    if (!cid) {
      setError('Esta venta no tiene cliente asociado')
      return
    }
    const cust = items.find((c) => c.id === cid) || {
      id: cid,
      name: sale.customer_name || 'Cliente',
      balance: sale.amount_due,
    }
    setPayTarget(cust)
    setPayOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-lavender px-2 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border">
            <Users className="h-3 w-3" />
            Clientes · CxC
          </div>
          <h1 className="font-display text-4xl md:text-5xl">Clientes</h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Catálogo de clientes, saldo y cuentas por cobrar. Abonos FIFO desde la cuenta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (tab === 'cxc' ? loadReceivables() : load())}
            disabled={loading || rxLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${loading || rxLoading ? 'animate-spin' : ''}`}
            />
            Actualizar
          </Button>
          <Button variant="lemon" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'clientes'}
          onClick={() => setTab('clientes')}
          className={`inline-flex h-10 items-center gap-2 rounded-xl brutal-border px-4 text-sm font-bold transition-all focus-brutal ${
            tab === 'clientes' ? 'bg-lavender brutal-shadow' : 'bg-white/70'
          }`}
        >
          <Users className="h-4 w-4" />
          Lista
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cxc'}
          onClick={() => setTab('cxc')}
          className={`inline-flex h-10 items-center gap-2 rounded-xl brutal-border px-4 text-sm font-bold transition-all focus-brutal ${
            tab === 'cxc' ? 'bg-coral brutal-shadow' : 'bg-white/70'
          }`}
        >
          <Receipt className="h-4 w-4" />
          Cuentas por cobrar
        </button>
      </div>

      {error && (
        <div className="rounded-xl brutal-border bg-coral/30 px-4 py-3 text-sm font-bold flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {tab === 'clientes' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40" aria-hidden />
              <Input
                id="customers-search"
                className="pl-9"
                placeholder="Buscar nombre, teléfono o email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar clientes"
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-2 border-ink"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Incluir inactivos
            </label>
          </div>

          {loading && (
            <div className="rounded-2xl brutal-border brutal-shadow bg-white/80 p-10 text-center font-display text-xl text-ink/50">
              Cargando clientes…
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <Card className="bg-lavender/30">
              <CardContent className="py-12 text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl brutal-border bg-lemon">
                  <Users className="h-8 w-8" />
                </div>
                <p className="font-display text-2xl">
                  {q.trim() ? 'Sin coincidencias' : 'Sin clientes aún'}
                </p>
                <p className="text-sm text-ink/60 font-medium max-w-sm mx-auto">
                  {q.trim()
                    ? 'Ningún cliente coincide con la búsqueda. Prueba otro término.'
                    : 'Registra el primero para fiados y abonos.'}
                </p>
                {!q.trim() && (
                  <Button variant="primary" onClick={openCreate}>
                    <Plus className="h-4 w-4" />
                    Nuevo cliente
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {!loading && filtered.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c) => {
                const owed = Number(c.balance) > 0
                return (
                  <Card
                    key={c.id}
                    className={`bg-white/90 cursor-pointer transition-transform hover:-translate-y-0.5 ${
                      owed ? 'ring-2 ring-coral ring-offset-2 ring-offset-cream' : ''
                    } ${c.active === false ? 'opacity-60' : ''}`}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <CardHeader className="pb-1">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg line-clamp-2">{c.name}</CardTitle>
                        {owed ? (
                          <Badge className="bg-coral shrink-0 normal-case tracking-normal">
                            {formatMoney(c.balance)}
                          </Badge>
                        ) : (
                          <Badge className="bg-mint shrink-0 normal-case tracking-normal">
                            Al corriente
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-ink/60">{c.phone}</p>
                      {c.email && (
                        <p className="text-xs text-ink/40 truncate">{c.email}</p>
                      )}
                      {c.active === false && (
                        <Badge className="bg-ink/10 text-ink/60 mt-1 w-fit normal-case">
                          Inactivo
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={(e) => openEdit(c, e)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-coral/30"
                          disabled={deletingId === c.id}
                          onClick={(e) => onDelete(c, e)}
                          aria-label={`Eliminar ${c.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'cxc' && (
        <div className="space-y-3">
          {rxLoading && (
            <div className="rounded-2xl brutal-border brutal-shadow bg-white/80 p-10 text-center font-display text-xl text-ink/50">
              Cargando CxC…
            </div>
          )}
          {!rxLoading && receivables.length === 0 && (
            <Card className="bg-mint/20">
              <CardContent className="py-10 text-center space-y-2">
                <p className="font-display text-2xl">Sin saldos pendientes</p>
                <p className="text-sm text-ink/60 font-medium">
                  No hay ventas parciales abiertas.
                </p>
              </CardContent>
            </Card>
          )}
          {!rxLoading &&
            receivables.map((sale) => (
              <Card key={sale.id} className="bg-white/90">
                <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg">
                        {formatMoney(sale.amount_due ?? sale.balance)}
                      </span>
                      <Badge className="bg-coral normal-case tracking-normal">
                        {sale.payment_status || 'partial'}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium text-ink/70">
                      Total {formatMoney(sale.total)} · Pagado{' '}
                      {formatMoney(sale.amount_paid)}
                    </p>
                    <p className="text-xs text-ink/40">
                      {formatDate(sale.created_at)}
                      {sale.customer_id && (
                        <>
                          {' · '}
                          <Link
                            to={`/clientes/${sale.customer_id}`}
                            className="underline font-bold text-ink/60"
                          >
                            Ver cliente
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="mint"
                    size="sm"
                    disabled={!sale.customer_id}
                    onClick={() => openPayForSale(sale)}
                  >
                    Registrar abono
                  </Button>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      <CustomerDialog
        open={dialogOpen}
        customer={editing}
        onClose={() => {
          setDialogOpen(false)
          setEditing(null)
        }}
        onSaved={load}
      />

      <PaymentDialog
        open={payOpen}
        customerId={payTarget?.id}
        customerName={payTarget?.name}
        balance={payTarget?.balance}
        onClose={() => {
          setPayOpen(false)
          setPayTarget(null)
        }}
        onPaid={() => {
          loadReceivables()
          load()
        }}
      />
    </div>
  )
}
