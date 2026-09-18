/**
 * F4 Kiosko público (JUA-11) — self-service order mode.
 * POST /api/kiosk/orders (auth:false). No salesApi / KioskCheckout.
 * Steps: catálogo → carrito/confirm → éxito.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Store,
  LogOut,
  Search,
  ImageIcon,
  Minus,
  Plus,
  Trash2,
  AlertTriangle,
  ShoppingBag,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { kioskApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import QuantityDialog from '@/components/QuantityDialog'

function formatMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

export default function Kiosk() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [cart, setCart] = useState([])
  const [step, setStep] = useState('catalog') // catalog | cart | success
  const [qtyOpen, setQtyOpen] = useState(false)
  const [qtyProduct, setQtyProduct] = useState(null)
  const [qtyInitial, setQtyInitial] = useState(undefined)
  const [editingCartId, setEditingCartId] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastOrder, setLastOrder] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await kioskApi.products()
      setProducts(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los productos')
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(() => {
    const set = new Set()
    products.forEach((p) => {
      if (p.category) set.add(String(p.category))
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
  }, [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (category && String(p.category || '') !== category) return false
      if (!q) return true
      const hay = `${p.name || ''} ${p.sku || ''} ${p.category || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [products, search, category])

  const cartTotal = useMemo(
    () => round2(cart.reduce((sum, ln) => sum + ln.qty * ln.price, 0)),
    [cart]
  )

  const openQty = (product, initialQuantity, cartProductId = null) => {
    if (Number(product.stock) <= 0 && !cartProductId) {
      setError(`Sin stock: ${product.name}`)
      return
    }
    setQtyProduct(product)
    setQtyInitial(initialQuantity)
    setEditingCartId(cartProductId)
    setQtyOpen(true)
  }

  const onQtyConfirm = ({ productId, quantity }) => {
    const product =
      qtyProduct?.id === productId
        ? qtyProduct
        : products.find((p) => p.id === productId)
    if (!product) return
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) return

    setCart((prev) => {
      const existing = prev.find((ln) => ln.productId === productId)
      if (editingCartId || existing) {
        return prev.map((ln) =>
          ln.productId === productId
            ? {
                ...ln,
                qty,
                name: product.name,
                price: Number(product.price) || 0,
                stock: Number(product.stock),
                unit: product.unit,
              }
            : ln
        )
      }
      return [
        ...prev,
        {
          productId,
          name: product.name,
          price: Number(product.price) || 0,
          qty,
          stock: Number(product.stock),
          unit: product.unit,
        },
      ]
    })
    setEditingCartId(null)
    setError('')
  }

  const bumpCartQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((ln) => {
          if (ln.productId !== productId) return ln
          const next = round2(Number(ln.qty) + delta)
          if (next <= 0) return null
          const max = Number(ln.stock)
          const qty = Number.isFinite(max) && next > max ? max : next
          return { ...ln, qty }
        })
        .filter(Boolean)
    )
  }

  const removeLine = (productId) => {
    setCart((prev) => prev.filter((ln) => ln.productId !== productId))
  }

  const clearCart = () => {
    setCart([])
    setCustomerName('')
    setNote('')
  }

  const onConfirmOrder = async () => {
    if (cart.length === 0) {
      setError('El carrito está vacío')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const order = await kioskApi.createOrder({
        lines: cart.map((ln) => ({
          product_id: ln.productId,
          qty: ln.qty,
        })),
        customer_name: customerName,
        note,
      })
      setLastOrder(order)
      clearCart()
      setStep('success')
    } catch (err) {
      setError(err.message || 'No se pudo enviar el pedido')
    } finally {
      setSubmitting(false)
    }
  }

  const startNew = () => {
    setLastOrder(null)
    setError('')
    setStep('catalog')
    load()
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream text-ink">
      <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-lemon/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl brutal-border brutal-shadow bg-white shrink-0">
              <Store className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-xl leading-none truncate">Kiosko</div>
              <div className="text-[10px] font-bold text-ink/50 uppercase tracking-widest">
                Autoservicio · pide y pasa a caja
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step !== 'success' && (
              <Button
                type="button"
                variant={step === 'cart' ? 'primary' : 'outline'}
                size="lg"
                className="relative min-h-12"
                onClick={() => setStep(step === 'cart' ? 'catalog' : 'cart')}
                disabled={cart.length === 0 && step !== 'cart'}
              >
                <ShoppingBag className="h-5 w-5" />
                <span className="hidden sm:inline">Carrito</span>
                {cart.length > 0 && (
                  <Badge className="bg-coral absolute -top-2 -right-2 min-w-6 justify-center">
                    {cart.length}
                  </Badge>
                )}
              </Button>
            )}
            <Link
              to="/"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl brutal-border brutal-shadow bg-white px-4 text-sm font-bold"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-5">
        {error && (
          <div className="mb-4 rounded-xl brutal-border bg-coral/30 px-4 py-3 text-sm font-bold flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-6">
            <div className="flex h-24 w-24 items-center justify-center rounded-full brutal-border brutal-shadow bg-mint">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <div>
              <h1 className="font-display text-4xl md:text-5xl">¡Pedido enviado!</h1>
              <p className="mt-3 text-lg font-medium text-ink/70 max-w-md mx-auto">
                Espera en caja. El personal recibirá tu pedido y te cobrará ahí.
              </p>
              {lastOrder?.id && (
                <p className="mt-2 text-sm font-bold text-ink/50">
                  Folio: {lastOrder.id}
                </p>
              )}
            </div>
            <Button type="button" variant="lemon" size="lg" className="min-h-14 px-8 text-lg" onClick={startNew}>
              Nuevo pedido
            </Button>
          </div>
        )}

        {step === 'catalog' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-ink/40" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto…"
                  className="pl-11 h-14 text-base"
                  aria-label="Buscar productos"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-14"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCategory('')}
                  className={`min-h-11 rounded-xl brutal-border px-4 text-sm font-bold transition-all ${
                    !category ? 'bg-blush brutal-shadow' : 'bg-white hover:bg-white/80'
                  }`}
                >
                  Todas
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`min-h-11 rounded-xl brutal-border px-4 text-sm font-bold transition-all ${
                      category === c ? 'bg-mint brutal-shadow' : 'bg-white hover:bg-white/80'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="rounded-2xl brutal-border brutal-shadow bg-white/80 p-12 text-center font-display text-2xl text-ink/50">
                Cargando productos…
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="rounded-2xl brutal-border bg-lavender/30 p-10 text-center">
                <p className="font-display text-2xl">Sin productos</p>
                <p className="text-sm text-ink/60 font-medium mt-2">
                  {products.length === 0
                    ? 'Aún no hay productos en el catálogo.'
                    : 'Prueba otra búsqueda o categoría.'}
                </p>
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {filtered.map((product) => {
                  const out = Number(product.stock) <= 0
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={out}
                      onClick={() => openQty(product, undefined, null)}
                      className="text-left rounded-2xl brutal-border brutal-shadow bg-white overflow-hidden transition-transform active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed min-h-[11rem]"
                    >
                      <div className="aspect-square bg-sky/20 border-b-[3px] border-ink relative flex items-center justify-center overflow-hidden">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-12 w-12 text-ink/25" />
                        )}
                        {out && (
                          <Badge className="absolute top-2 left-2 bg-coral">Sin stock</Badge>
                        )}
                      </div>
                      <div className="p-3 space-y-1">
                        <div className="font-display text-base line-clamp-2 leading-tight">
                          {product.name}
                        </div>
                        <div className="font-display text-xl">{formatMoney(product.price)}</div>
                        {product.category && (
                          <Badge className="bg-mint normal-case tracking-normal text-[10px]">
                            {product.category}
                          </Badge>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {cart.length > 0 && (
              <div className="sticky bottom-4 z-30">
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full min-h-14 text-lg shadow-lg"
                  onClick={() => setStep('cart')}
                >
                  Ver carrito ({cart.length}) · {formatMoney(cartTotal)}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'cart' && (
          <div className="mx-auto max-w-lg space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="font-display text-3xl">Tu pedido</h1>
              <Button type="button" variant="ghost" onClick={() => setStep('catalog')}>
                Seguir comprando
              </Button>
            </div>

            {cart.length === 0 ? (
              <div className="rounded-2xl brutal-border bg-white p-8 text-center">
                <p className="font-medium text-ink/60">El carrito está vacío</p>
                <Button
                  type="button"
                  variant="lemon"
                  className="mt-4"
                  onClick={() => setStep('catalog')}
                >
                  Ir al catálogo
                </Button>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {cart.map((ln) => (
                    <li
                      key={ln.productId}
                      className="rounded-2xl brutal-border bg-white p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="font-display text-lg text-left hover:underline"
                          onClick={() => {
                            const p = products.find((x) => x.id === ln.productId) || {
                              id: ln.productId,
                              name: ln.name,
                              price: ln.price,
                              stock: ln.stock,
                              unit: ln.unit,
                            }
                            openQty(p, ln.qty, ln.productId)
                          }}
                        >
                          {ln.name}
                        </button>
                        <button
                          type="button"
                          className="text-danger p-2 min-h-11 min-w-11"
                          aria-label={`Quitar ${ln.name}`}
                          onClick={() => removeLine(ln.productId)}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() => bumpCartQty(ln.productId, -1)}
                            aria-label="Menos"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="min-w-[3rem] text-center text-lg font-bold">
                            {ln.qty}
                            {ln.unit ? ` ${ln.unit}` : ''}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() => bumpCartQty(ln.productId, 1)}
                            aria-label="Más"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold uppercase text-ink/40">
                            {formatMoney(ln.price)} c/u
                          </div>
                          <div className="font-display text-xl">
                            {formatMoney(ln.qty * ln.price)}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="rounded-2xl brutal-border bg-lemon/50 px-4 py-4 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-ink/60">
                    Total estimado
                  </span>
                  <span className="font-display text-3xl">{formatMoney(cartTotal)}</span>
                </div>
                <p className="text-xs font-medium text-ink/50 text-center">
                  El precio final lo confirma caja. Este total es una guía.
                </p>

                <div className="space-y-3 rounded-2xl brutal-border bg-white p-4">
                  <div className="space-y-2">
                    <Label htmlFor="kiosk-name">Tu nombre (opcional)</Label>
                    <Input
                      id="kiosk-name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ej. Ana"
                      className="h-12 text-base"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kiosk-note">Nota (opcional)</Label>
                    <Input
                      id="kiosk-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Sin cebolla, mesa 3…"
                      className="h-12 text-base"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full min-h-14 text-lg"
                  disabled={submitting || cart.length === 0}
                  onClick={onConfirmOrder}
                >
                  {submitting ? 'Enviando…' : 'Confirmar pedido'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full min-h-11"
                  onClick={clearCart}
                  disabled={submitting}
                >
                  Vaciar carrito
                </Button>
              </>
            )}
          </div>
        )}
      </main>

      <QuantityDialog
        open={qtyOpen}
        onClose={() => {
          setQtyOpen(false)
          setQtyProduct(null)
          setEditingCartId(null)
        }}
        product={qtyProduct}
        onConfirm={onQtyConfirm}
        initialQuantity={qtyInitial}
      />
    </div>
  )
}
