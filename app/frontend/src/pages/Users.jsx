/**
 * Usuarios — admin-only. Crear cuentas (cajero/despacho/admin) y cambiar
 * rol o estado activo. Login es por username, no email.
 */
import { useCallback, useEffect, useState } from 'react'
import { UserCog, Plus, RefreshCw, AlertTriangle, ShieldAlert, Ban, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usersApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const ROLES = [
  { value: 'cajero', label: 'Cajero' },
  { value: 'despacho', label: 'Despacho' },
  { value: 'admin', label: 'Admin' },
]

function roleBadgeClass(role) {
  if (role === 'admin') return 'bg-lavender'
  if (role === 'despacho') return 'bg-mint'
  return 'bg-sky'
}

const EMPTY_FORM = { username: '', name: '', password: '', role: 'cajero' }

export default function Users() {
  const { user: me } = useAuth()
  const isAdmin = me?.role === 'admin'

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const list = await usersApi.list()
      setItems(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los usuarios')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    load()
  }, [load])

  const onCreate = async (e) => {
    e.preventDefault()
    setError('')
    setCreating(true)
    try {
      await usersApi.create(form)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      setError(err.message || 'No se pudo crear el usuario')
    } finally {
      setCreating(false)
    }
  }

  const onRoleChange = async (u, role) => {
    setError('')
    setBusyId(u.id)
    try {
      const updated = await usersApi.update(u.id, { role })
      setItems((prev) => prev.map((it) => (it.id === u.id ? updated : it)))
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el rol')
    } finally {
      setBusyId(null)
    }
  }

  const onToggleActive = async (u) => {
    setError('')
    setBusyId(u.id)
    try {
      const updated = await usersApi.update(u.id, { is_active: !u.is_active })
      setItems((prev) => prev.map((it) => (it.id === u.id ? updated : it)))
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado')
    } finally {
      setBusyId(null)
    }
  }

  if (!isAdmin) {
    return (
      <Card className="bg-lemon/40">
        <CardContent className="pt-6 flex items-start gap-3">
          <ShieldAlert className="h-6 w-6 shrink-0" />
          <p className="text-sm font-medium">Solo administradores pueden ver esta página.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-lavender px-2 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border">
            <UserCog className="h-3 w-3" />
            Usuarios
          </div>
          <h1 className="font-display text-4xl md:text-5xl">Usuarios</h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Crea cuentas para cajeros, despacho u otros admins, y administra sus roles.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-xl brutal-border bg-coral/30 px-4 py-3 text-sm font-bold flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="bg-mint/30">
        <CardHeader>
          <CardTitle className="text-xl">Nuevo usuario</CardTitle>
          <CardDescription>Entra a la app con usuario + contraseña (no correo)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="new_username">Usuario</Label>
              <Input
                id="new_username"
                placeholder="cajero1"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_name">Nombre</Label>
              <Input
                id="new_name"
                placeholder="María López"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_password">Contraseña</Label>
              <Input
                id="new_password"
                type="password"
                placeholder="mín. 6 caracteres"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_role">Rol</Label>
              <select
                id="new_role"
                className="flex h-11 w-full rounded-xl brutal-border bg-white px-3 text-sm font-bold"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" variant="primary" disabled={creating}>
                <Plus className="h-4 w-4" />
                {creating ? 'Creando…' : 'Crear usuario'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <div className="rounded-2xl brutal-border brutal-shadow bg-white/80 p-10 text-center font-display text-xl text-ink/50">
          Cargando usuarios…
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((u) => {
            const isSelf = u.id === me?.id
            return (
              <Card key={u.id} className={`bg-white/90 ${u.is_active === false ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-lg truncate">{u.name}</CardTitle>
                      <p className="text-sm font-medium text-ink/60">@{u.username}</p>
                    </div>
                    <Badge className={roleBadgeClass(u.role)}>{u.role}</Badge>
                  </div>
                  {isSelf && (
                    <Badge className="bg-lemon w-fit normal-case mt-1">Tú</Badge>
                  )}
                  {u.is_active === false && (
                    <Badge className="bg-ink/10 text-ink/60 w-fit normal-case mt-1">
                      Desactivado
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <select
                    className="w-full rounded-xl brutal-border bg-cream px-3 py-2 text-sm font-bold disabled:opacity-50"
                    value={u.role}
                    disabled={isSelf || busyId === u.id}
                    onChange={(e) => onRoleChange(u, e.target.value)}
                    aria-label={`Rol de ${u.name}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={isSelf || busyId === u.id}
                    onClick={() => onToggleActive(u)}
                  >
                    {u.is_active === false ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Reactivar
                      </>
                    ) : (
                      <>
                        <Ban className="h-3.5 w-3.5" />
                        Desactivar
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
