import { useEffect, useId, useRef, useState } from 'react'
import { X, Upload, Loader2 } from 'lucide-react'
import { productsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ProductImage from '@/components/ProductImage'

const EMPTY = {
  name: '',
  sku: '',
  category: '',
  unit: 'pza',
  stock: 0,
  price: 0,
  cost: 0,
  image_url: null,
  active: true,
}

export default function ProductDialog({ open, product, onClose, onSaved }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const isEdit = Boolean(product?.id)

  useEffect(() => {
    if (!open) return
    setError('')
    setBusy(false)
    setUploading(false)
    if (product) {
      setForm({
        name: product.name ?? '',
        sku: product.sku ?? '',
        category: product.category ?? '',
        unit: product.unit ?? 'pza',
        stock: product.stock ?? 0,
        price: product.price ?? 0,
        cost: product.cost ?? 0,
        image_url: product.image_url ?? null,
        active: product.active !== false,
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, product])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy && !uploading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, uploading, onClose])

  if (!open) return null

  const setField = (key) => (e) => {
    const raw = e.target.value
    const numeric = ['stock', 'price', 'cost'].includes(key)
    setForm((f) => ({ ...f, [key]: numeric ? (raw === '' ? '' : Number(raw)) : raw }))
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const res = await productsApi.uploadImage(file)
      const url = res?.image_url
      if (!url) throw new Error('La subida no devolvió image_url')
      setForm((f) => ({ ...f, image_url: url }))
    } catch (err) {
      setError(err.message || 'Error al subir imagen')
    } finally {
      setUploading(false)
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      name: String(form.name).trim(),
      sku: String(form.sku).trim(),
      category: String(form.category).trim(),
      unit: String(form.unit).trim() || 'pza',
      stock: Number(form.stock) || 0,
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      image_url: form.image_url || null,
      active: Boolean(form.active),
    }
    if (!payload.name) {
      setError('El nombre es obligatorio')
      setBusy(false)
      return
    }
    try {
      if (isEdit) {
        await productsApi.update(product.id, payload)
      } else {
        await productsApi.create(payload)
      }
      onSaved?.()
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
        onClick={() => !busy && !uploading && onClose()}
      />
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl brutal-border brutal-shadow-lg bg-cream"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b-[3px] border-ink bg-cream px-5 py-4">
          <h2 id={titleId} className="font-display text-xl">
            {isEdit ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={busy || uploading}
            aria-label="Cerrar diálogo"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="prod-name">Nombre</Label>
            <Input
              id="prod-name"
              value={form.name}
              onChange={setField('name')}
              required
              placeholder="Ej. Coca-Cola 600ml"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prod-sku">SKU</Label>
              <Input
                id="prod-sku"
                value={form.sku}
                onChange={setField('sku')}
                placeholder="SKU-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-unit">Unidad</Label>
              <Input
                id="prod-unit"
                value={form.unit}
                onChange={setField('unit')}
                placeholder="pza"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prod-category">Categoría</Label>
            <Input
              id="prod-category"
              value={form.category}
              onChange={setField('category')}
              placeholder="Bebidas"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prod-stock">Stock</Label>
              <Input
                id="prod-stock"
                type="number"
                min="0"
                step="1"
                value={form.stock}
                onChange={setField('stock')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-price">Precio</Label>
              <Input
                id="prod-price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={setField('price')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-cost">Costo</Label>
              <Input
                id="prod-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={setField('cost')}
              />
            </div>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-2 border-ink"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Producto activo
            </label>
          )}

          <div className="space-y-2">
            <Label>Imagen</Label>
            <div className="flex items-start gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl brutal-border bg-white">
                <ProductImage
                  src={form.image_url}
                  alt={form.name || 'Vista previa'}
                  iconClassName="h-8 w-8 text-ink/30"
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <label className="inline-flex cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={onFile}
                    disabled={uploading || busy}
                    aria-label="Subir imagen del producto"
                  />
                  <span className="inline-flex h-11 items-center gap-2 rounded-xl brutal-border brutal-shadow bg-sky px-4 text-sm font-bold transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploading ? 'Subiendo…' : 'Subir imagen'}
                  </span>
                </label>
                {form.image_url && (
                  <button
                    type="button"
                    className="text-left text-xs font-bold text-ink/50 underline"
                    onClick={() => setForm((f) => ({ ...f, image_url: null }))}
                    disabled={busy || uploading}
                  >
                    Quitar imagen
                  </button>
                )}
                <p className="text-[11px] text-ink/40 font-medium">
                  POST /api/products/upload → solo se guarda image_url (sin Base64).
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl brutal-border bg-coral/30 px-3 py-2 text-sm font-bold">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={busy || uploading} className="flex-1">
              {busy ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear producto'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy || uploading}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
