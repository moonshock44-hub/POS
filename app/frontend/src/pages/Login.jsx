import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && isAuthenticated) return <Navigate to="/" replace />

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full bg-blush brutal-border opacity-80" />
      <div className="pointer-events-none absolute top-20 -right-8 h-28 w-28 rotate-12 rounded-2xl bg-mint brutal-border opacity-80" />
      <div className="pointer-events-none absolute bottom-16 left-1/4 h-16 w-16 -rotate-6 rounded-full bg-lemon brutal-border opacity-70" />

      <Card className="w-full max-w-md relative z-10 bg-white">
        <CardHeader>
          <div className="mb-2 inline-flex rounded-lg bg-lavender px-2 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border">
            Acceso
          </div>
          <CardTitle>Entrar a la tiendita</CardTitle>
          <CardDescription>
            Sesión por cookie HttpOnly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="rounded-xl brutal-border bg-coral/30 px-3 py-2 text-sm font-bold">
                {error}
              </div>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? 'Entrando…' : 'Iniciar sesión'}
            </Button>
          </form>
          <p className="mt-5 text-xs text-ink/50 font-medium leading-relaxed">
            Usa la cuenta admin sembrada en el servidor (credenciales no se muestran aquí).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
