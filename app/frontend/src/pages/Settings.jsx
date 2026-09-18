/**
 * F6 Configuración (JUA-15) — business / brand / kiosk / ticket / whatsapp.
 * Save via PATCH; Reset re-GETs (or defaults). Admin-preferred UX.
 */
import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, RefreshCw, Save, ShieldAlert, Palette } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useSettings,
  DEFAULT_SETTINGS,
  toSettingsPayload,
} from '@/contexts/SettingsContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function cloneForm(settings) {
  return {
    business_name: settings.business_name ?? DEFAULT_SETTINGS.business_name,
    brand: {
      primary_color: settings.brand?.primary_color ?? DEFAULT_SETTINGS.brand.primary_color,
      secondary_color:
        settings.brand?.secondary_color ?? DEFAULT_SETTINGS.brand.secondary_color,
      accent_color: settings.brand?.accent_color ?? DEFAULT_SETTINGS.brand.accent_color,
    },
    kiosk: {
      welcome_text: settings.kiosk?.welcome_text ?? DEFAULT_SETTINGS.kiosk.welcome_text,
      logo_url: settings.kiosk?.logo_url ?? DEFAULT_SETTINGS.kiosk.logo_url,
    },
    ticket: {
      footer: settings.ticket?.footer ?? DEFAULT_SETTINGS.ticket.footer,
      show_sku: !!settings.ticket?.show_sku,
      show_change: settings.ticket?.show_change !== false,
    },
    whatsapp: {
      enabled: !!settings.whatsapp?.enabled,
      default_country_code:
        settings.whatsapp?.default_country_code ??
        DEFAULT_SETTINGS.whatsapp.default_country_code,
      message_template:
        settings.whatsapp?.message_template ??
        DEFAULT_SETTINGS.whatsapp.message_template,
    },
  }
}

function ColorField({ id, label, value, onChange, disabled }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value || '#000000'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 cursor-pointer rounded-xl brutal-border bg-white p-1 disabled:opacity-50"
        />
        <Input
          id={`${id}-hex`}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#ff8a7a"
          className="font-mono uppercase"
          aria-label={`${label} (hex)`}
        />
      </div>
    </div>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const {
    settings,
    loading,
    error,
    refresh,
    applyPreviewBrand,
    savePatch,
    setError,
  } = useSettings()

  const [form, setForm] = useState(() => cloneForm(settings))
  const [saving, setSaving] = useState(false)
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    setForm(cloneForm(settings))
  }, [settings])

  useEffect(() => {
    applyPreviewBrand(form.brand)
    return () => applyPreviewBrand(null)
  }, [form.brand, applyPreviewBrand])

  const setField = (path, value) => {
    setForm((prev) => {
      const next = structuredClone(prev)
      const parts = path.split('.')
      let cur = next
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]]
      cur[parts[parts.length - 1]] = value
      return next
    })
    setOkMsg('')
  }

  const onSave = async (e) => {
    e?.preventDefault?.()
    if (!isAdmin) return
    setSaving(true)
    setOkMsg('')
    setError('')
    try {
      await savePatch(toSettingsPayload(form))
      setOkMsg('Configuración guardada')
    } catch (err) {
      setError(err.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const onReset = async () => {
    setOkMsg('')
    setError('')
    applyPreviewBrand(null)
    const fresh = await refresh()
    if (fresh) setForm(cloneForm(fresh))
    else setForm(cloneForm(DEFAULT_SETTINGS))
  }

  const disabled = !isAdmin || saving || loading

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl md:text-5xl flex items-center gap-3">
            <SettingsIcon className="h-9 w-9" />
            Configuración
          </h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Negocio, marca, kiosko, ticket y WhatsApp. Los colores se previsualizan al instante.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {settings.updated_at && (
            <Badge className="bg-sky text-xs py-1">
              act. {new Date(settings.updated_at).toLocaleString('es-MX')}
            </Badge>
          )}
          <Badge className={isAdmin ? 'bg-lavender' : 'bg-lemon'}>
            {isAdmin ? 'admin' : 'solo lectura'}
          </Badge>
        </div>
      </div>

      {!isAdmin && (
        <Card className="bg-lemon/40">
          <CardContent className="pt-6 flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 shrink-0" />
            <p className="text-sm font-medium">
              Solo administradores pueden editar la configuración. Puedes ver los valores actuales.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-xl brutal-border bg-coral/40 px-4 py-3 text-sm font-bold">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="rounded-xl brutal-border bg-mint/50 px-4 py-3 text-sm font-bold">
          {okMsg}
        </div>
      )}

      <form onSubmit={onSave} className="space-y-4">
        <Card className="bg-blush/30">
          <CardHeader>
            <CardTitle className="text-xl">Negocio</CardTitle>
            <CardDescription>Nombre visible en tickets y UI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="business_name">Nombre del negocio</Label>
              <Input
                id="business_name"
                value={form.business_name}
                disabled={disabled}
                onChange={(e) => setField('business_name', e.target.value)}
                placeholder={DEFAULT_SETTINGS.business_name}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-lavender/30">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Marca
            </CardTitle>
            <CardDescription>
              Colores → <code className="text-xs">--brand-primary / secondary / accent</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorField
                id="primary_color"
                label="Primario"
                value={form.brand.primary_color}
                disabled={disabled}
                onChange={(v) => setField('brand.primary_color', v)}
              />
              <ColorField
                id="secondary_color"
                label="Secundario"
                value={form.brand.secondary_color}
                disabled={disabled}
                onChange={(v) => setField('brand.secondary_color', v)}
              />
              <ColorField
                id="accent_color"
                label="Acento"
                value={form.brand.accent_color}
                disabled={disabled}
                onChange={(v) => setField('brand.accent_color', v)}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <span
                className="h-10 flex-1 rounded-xl brutal-border"
                style={{ background: form.brand.primary_color }}
                title="primary"
              />
              <span
                className="h-10 flex-1 rounded-xl brutal-border"
                style={{ background: form.brand.secondary_color }}
                title="secondary"
              />
              <span
                className="h-10 flex-1 rounded-xl brutal-border"
                style={{ background: form.brand.accent_color }}
                title="accent"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-lemon/30">
          <CardHeader>
            <CardTitle className="text-xl">Kiosko</CardTitle>
            <CardDescription>Texto de bienvenida y logo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="welcome_text">Texto de bienvenida</Label>
              <Input
                id="welcome_text"
                value={form.kiosk.welcome_text}
                disabled={disabled}
                onChange={(e) => setField('kiosk.welcome_text', e.target.value)}
                placeholder={DEFAULT_SETTINGS.kiosk.welcome_text}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logo_url">URL del logo</Label>
              <Input
                id="logo_url"
                value={form.kiosk.logo_url || ''}
                disabled={disabled}
                onChange={(e) => setField('kiosk.logo_url', e.target.value)}
                placeholder="https://…"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-mint/30">
          <CardHeader>
            <CardTitle className="text-xl">Ticket</CardTitle>
            <CardDescription>Pie de página y campos visibles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ticket_footer">Pie de ticket</Label>
              <Input
                id="ticket_footer"
                value={form.ticket.footer}
                disabled={disabled}
                onChange={(e) => setField('ticket.footer', e.target.value)}
                placeholder={DEFAULT_SETTINGS.ticket.footer}
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand-primary)]"
                checked={!!form.ticket.show_sku}
                disabled={disabled}
                onChange={(e) => setField('ticket.show_sku', e.target.checked)}
              />
              Mostrar SKU en ticket
            </label>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand-primary)]"
                checked={!!form.ticket.show_change}
                disabled={disabled}
                onChange={(e) => setField('ticket.show_change', e.target.checked)}
              />
              Mostrar cambio en ticket
            </label>
          </CardContent>
        </Card>

        <Card className="bg-sky/30">
          <CardHeader>
            <CardTitle className="text-xl">WhatsApp</CardTitle>
            <CardDescription>Envío de tickets por wa.me</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand-primary)]"
                checked={!!form.whatsapp.enabled}
                disabled={disabled}
                onChange={(e) => setField('whatsapp.enabled', e.target.checked)}
              />
              Habilitar WhatsApp
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="cc">Código de país</Label>
              <Input
                id="cc"
                value={form.whatsapp.default_country_code}
                disabled={disabled}
                onChange={(e) => setField('whatsapp.default_country_code', e.target.value)}
                placeholder="52"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa_tpl">Plantilla de mensaje</Label>
              <textarea
                id="wa_tpl"
                rows={3}
                disabled={disabled}
                value={form.whatsapp.message_template || ''}
                onChange={(e) => setField('whatsapp.message_template', e.target.value)}
                placeholder={DEFAULT_SETTINGS.whatsapp.message_template}
                className="flex w-full rounded-xl brutal-border bg-white px-3 py-2 text-sm font-medium text-ink placeholder:text-ink/40 outline-none focus-visible:ring-2 focus-visible:ring-lavender focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50"
              />
              <p className="text-xs text-ink/50 font-medium">
                Placeholders: {'{business_name}'}, {'{total}'}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3 sticky bottom-4 z-10">
          <Button type="submit" variant="primary" disabled={disabled || !isAdmin}>
            <Save className="h-4 w-4" />
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          <Button type="button" variant="outline" onClick={onReset} disabled={saving || loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Restablecer
          </Button>
        </div>
      </form>
    </div>
  )
}
