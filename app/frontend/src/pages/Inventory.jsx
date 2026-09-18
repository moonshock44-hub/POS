import { useCallback, useEffect, useState } from 'react'
import { Package, Plus, Pencil, Trash2, AlertTriangle, RefreshCw } from 'lucide-react'
import { productsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ProductDialog from '@/components/ProductDialog'
import ProductImage from '@/components/ProductImage'

/** UI-only low-stock rule (backend has no threshold field). */
const LOW_STOCK = 5

function formatMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

function isLowStock(product) {
  return Number(product.stock) <= LOW_STOCK
}

export default function Inventory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await productsApi.list()
      setItems(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message || 'No se pudo cargar el inventario')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (product) => {
    setEditing(product)
    setDialogOpen(true)
  }

  const onDelete = async (product) => {
    const ok = window.confirm(
      `¿Desactivar «${product.name}»? Se marcará como inactivo (soft-delete).`
    )
    if (!ok) return
    setDeletingId(product.id)
    setError('')
    try {
      await productsApi.remove(product.id)
      await load()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-mint px-2 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border">
            <Package className="h-3 w-3" />
            Inventario
          </div>
          <h1 className="font-display text-4xl md:text-5xl">Productos</h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Catálogo con stock, precios e imágenes. Stock bajo en UI cuando stock ≤ {LOW_STOCK}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button variant="lemon" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl brutal-border bg-coral/30 px-4 py-3 text-sm font-bold flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl brutal-border brutal-shadow bg-white/80 p-10 text-center font-display text-xl text-ink/50">
          Cargando inventario…
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <Card className="bg-lavender/30">
          <CardContent className="py-12 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl brutal-border bg-lemon">
              <Package className="h-8 w-8" />
            </div>
            <p className="font-display text-2xl">Sin productos aún</p>
            <p className="text-sm text-ink/60 font-medium max-w-sm mx-auto">
              Aún no hay productos en el catálogo. Agrega el primero para empezar el inventario.
            </p>
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nuevo producto
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((product) => {
            const low = isLowStock(product)
            return (
              <Card
                key={product.id}
                className={`bg-white/90 overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5 ${
                  low ? 'ring-2 ring-coral ring-offset-2 ring-offset-cream' : ''
                }`}
                onClick={() => openEdit(product)}
              >
                <div className="aspect-[4/3] bg-sky/20 border-b-[3px] border-ink relative flex items-center justify-center overflow-hidden">
                  <ProductImage
                    src={product.image_url}
                    alt={product.name || 'Producto'}
                    className="h-full w-full object-cover"
                  />
                  {low && (
                    <Badge className="absolute top-2 left-2 bg-coral text-ink">
                      Stock bajo
                    </Badge>
                  )}
                </div>
                <CardHeader className="pb-1">
                  <CardTitle className="text-lg line-clamp-2">{product.name}</CardTitle>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {product.sku && (
                      <Badge className="bg-lemon normal-case tracking-normal font-mono text-[10px]">
                        {product.sku}
                      </Badge>
                    )}
                    {product.category && (
                      <Badge className="bg-mint normal-case tracking-normal">{product.category}</Badge>
                    )}
                    {product.unit && (
                      <Badge className="bg-lavender normal-case tracking-normal">{product.unit}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-ink/40">
                        Stock
                      </div>
                      <div className={`font-display text-2xl ${low ? 'text-danger' : ''}`}>
                        {product.stock}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-ink/40">
                        Precio
                      </div>
                      <div className="font-display text-xl">{formatMoney(product.price)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEdit(product)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-coral/30"
                      disabled={deletingId === product.id}
                      onClick={() => onDelete(product)}
                      aria-label={`Eliminar ${product.name}`}
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

      <ProductDialog
        open={dialogOpen}
        product={editing}
        onClose={() => {
          setDialogOpen(false)
          setEditing(null)
        }}
        onSaved={load}
      />
    </div>
  )
}
