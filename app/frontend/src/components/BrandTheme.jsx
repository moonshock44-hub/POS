/**
 * BrandTheme — maps settings brand colors → CSS vars on :root.
 * --brand-primary   ← brand.primary_color
 * --brand-secondary ← brand.secondary_color
 * --brand-accent    ← brand.accent_color
 * Also mirrors onto coral / lavender / lemon so neo-brutal UI reflects live.
 * Updates on saved settings and on Settings form preview (before save).
 */
import { useEffect } from 'react'
import { useSettings } from '@/contexts/SettingsContext'

const FALLBACK = {
  primary_color: '#ff8a7a',
  secondary_color: '#c9b1ff',
  accent_color: '#ffe66d',
}

function applyBrandVars(brand) {
  const root = document.documentElement
  const primary = brand?.primary_color || FALLBACK.primary_color
  const secondary = brand?.secondary_color || FALLBACK.secondary_color
  const accent = brand?.accent_color || FALLBACK.accent_color

  root.style.setProperty('--brand-primary', primary)
  root.style.setProperty('--brand-secondary', secondary)
  root.style.setProperty('--brand-accent', accent)

  // Live reflection across existing Tailwind theme tokens
  root.style.setProperty('--color-coral', primary)
  root.style.setProperty('--color-lavender', secondary)
  root.style.setProperty('--color-lemon', accent)
}

export default function BrandTheme() {
  const { brand } = useSettings()

  useEffect(() => {
    applyBrandVars(brand)
  }, [brand])

  return null
}
