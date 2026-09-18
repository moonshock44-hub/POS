import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { settingsApi } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'

/** Visible UI defaults — merged with whatever GET returns. */
export const DEFAULT_SETTINGS = {
  business_name: 'Mi Tiendita',
  brand: {
    primary_color: '#ff8a7a',
    secondary_color: '#c9b1ff',
    accent_color: '#ffe66d',
  },
  kiosk: {
    welcome_text: '¡Bienvenido! Escoge tus productos',
    logo_url: '',
  },
  ticket: {
    footer: '¡Gracias por su compra!',
    show_sku: false,
    show_change: true,
  },
  whatsapp: {
    enabled: false,
    default_country_code: '52',
    message_template:
      'Hola, aquí está tu ticket de {business_name}. Total: {total}',
  },
}

function mergeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    id: src.id ?? null,
    updated_at: src.updated_at ?? null,
    business_name:
      src.business_name != null && String(src.business_name).trim() !== ''
        ? String(src.business_name)
        : DEFAULT_SETTINGS.business_name,
    brand: {
      primary_color:
        src.brand?.primary_color || DEFAULT_SETTINGS.brand.primary_color,
      secondary_color:
        src.brand?.secondary_color || DEFAULT_SETTINGS.brand.secondary_color,
      accent_color:
        src.brand?.accent_color || DEFAULT_SETTINGS.brand.accent_color,
    },
    kiosk: {
      welcome_text:
        src.kiosk?.welcome_text != null
          ? String(src.kiosk.welcome_text)
          : DEFAULT_SETTINGS.kiosk.welcome_text,
      logo_url:
        src.kiosk?.logo_url != null
          ? String(src.kiosk.logo_url)
          : DEFAULT_SETTINGS.kiosk.logo_url,
    },
    ticket: {
      footer:
        src.ticket?.footer != null
          ? String(src.ticket.footer)
          : DEFAULT_SETTINGS.ticket.footer,
      show_sku:
        typeof src.ticket?.show_sku === 'boolean'
          ? src.ticket.show_sku
          : DEFAULT_SETTINGS.ticket.show_sku,
      show_change:
        typeof src.ticket?.show_change === 'boolean'
          ? src.ticket.show_change
          : DEFAULT_SETTINGS.ticket.show_change,
    },
    whatsapp: {
      enabled:
        typeof src.whatsapp?.enabled === 'boolean'
          ? src.whatsapp.enabled
          : DEFAULT_SETTINGS.whatsapp.enabled,
      default_country_code:
        src.whatsapp?.default_country_code != null
          ? String(src.whatsapp.default_country_code)
          : DEFAULT_SETTINGS.whatsapp.default_country_code,
      message_template:
        src.whatsapp?.message_template != null
          ? String(src.whatsapp.message_template)
          : DEFAULT_SETTINGS.whatsapp.message_template,
    },
  }
}

/** Payload for PUT (full replace of editable fields). */
export function toSettingsPayload(form) {
  return {
    business_name: form.business_name,
    brand: {
      primary_color: form.brand.primary_color,
      secondary_color: form.brand.secondary_color,
      accent_color: form.brand.accent_color,
    },
    kiosk: {
      welcome_text: form.kiosk.welcome_text,
      logo_url: form.kiosk.logo_url || null,
    },
    ticket: {
      footer: form.ticket.footer,
      show_sku: !!form.ticket.show_sku,
      show_change: !!form.ticket.show_change,
    },
    whatsapp: {
      enabled: !!form.whatsapp.enabled,
      default_country_code: form.whatsapp.default_country_code,
      message_template: form.whatsapp.message_template || null,
    },
  }
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [settings, setSettings] = useState(() => mergeSettings(null))
  const [previewBrand, setPreviewBrand] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await settingsApi.get()
      const merged = mergeSettings(data)
      setSettings(merged)
      setPreviewBrand(null)
      return merged
    } catch (err) {
      setError(err.message || 'No se pudo cargar configuración')
      setSettings(mergeSettings(null))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setPreviewBrand(null)
      setSettings(mergeSettings(null))
      return
    }
    refresh()
  }, [isAuthenticated, refresh])

  const applyPreviewBrand = useCallback((brand) => {
    setPreviewBrand(brand ? { ...brand } : null)
  }, [])

  const savePatch = useCallback(async (partial) => {
    const data = await settingsApi.patch(partial)
    const merged = mergeSettings(data)
    setSettings(merged)
    setPreviewBrand(null)
    return merged
  }, [])

  const savePut = useCallback(async (form) => {
    const data = await settingsApi.put(toSettingsPayload(form))
    const merged = mergeSettings(data)
    setSettings(merged)
    setPreviewBrand(null)
    return merged
  }, [])

  const brand = useMemo(
    () => ({
      ...settings.brand,
      ...(previewBrand || {}),
    }),
    [settings.brand, previewBrand]
  )

  const value = useMemo(
    () => ({
      settings,
      brand,
      loading,
      error,
      refresh,
      applyPreviewBrand,
      savePatch,
      savePut,
      setError,
    }),
    [
      settings,
      brand,
      loading,
      error,
      refresh,
      applyPreviewBrand,
      savePatch,
      savePut,
    ]
  )

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
