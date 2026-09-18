import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShoppingCart,
  Search,
  AlertTriangle,
  RefreshCw,
  ImageIcon,
  Minus,
  Plus,
  Trash2,
  Banknote,
  CreditCard,
} from 'lucide-react'
import { productsApi, salesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import QuantityDialog from '@/components/QuantityDialog'
import ReceiptModal from '@/components/ReceiptModal'
import CustomerPicker from '@/components/CustomerPicker'
import DriverPicker from '@/components/DriverPicker'

function formatMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v)
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

export default function Pos() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [cart, setCart] = useState([])
  const [qtyOpen, setQtyOpen] = useState(false)
  const [qtyProduct, setQtyProduct] = useState(null)
  const [qtyInitial, setQtyInitial] = useState(undefined)
  const [editingCartId, setEditingCartId] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptSale, setReceiptSale] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedDriver, setSelectedDriver] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await productsApi.list()
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

  const paidNum = Number(amountPaid)
  const paidValid = amountPaid !== '' && Number.isFinite(paidNum) && paidNum >= 0
  const change = paidValid && paidNum >= cartTotal ? round2(paidNum - cartTotal) : 0
  const amountDue = paidValid && paidNum < cartTotal ? round2(cartTotal - paidNum) : 0
  const isCredito = paidValid && paidNum < cartTotal

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
    setAmountPaid('')
    setPaymentMethod('cash')
    setSelectedCustomer(null)
    setSelectedDriver(null)
  }

  const onCheckout = async () => {
    if (cart.length === 0) {
      setError('El carrito está vacío')
      return
    }
    if (!paidValid) {
      setError('Ingresa el monto pagado (0 o más)')
      return
    }
    if (isCredito && !selectedCustomer?.id) {
      setError('Selecciona o crea un cliente para venta a crédito')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const nameById = Object.fromEntries(cart.map((ln) => [ln.productId, ln.name]))
      const body = {
        lines: cart.map((ln) => ({
          product_id: ln.productId,
          qty: ln.qty,
          price: ln.price,
        })),
        payment_method: paymentMethod,
        amount_paid: paidNum,
      }
      if (selectedCustomer?.id) {
        body.customer_id = selectedCustomer.id
      }
      if (selectedDriver?.id) {
        body.delivery_driver_id = selectedDriver.id
        body.delivery_status = 'assigned'
      }
      const sale = await salesApi.create(body)
      const enriched = {
        ...sale,
        lines: (sale.lines || []).map((ln) => ({
          ...ln,
          name: ln.name || nameById[ln.product_id] || `Producto ${ln.product_id || ''}`.trim(),
        })),
        customer_id: sale.customer_id ?? selectedCustomer?.id ?? null,
        customer_phone: selectedCustomer?.phone || sale.customer_phone || undefined,
      }
      setReceiptSale(enriched)
      setReceiptOpen(true)
      clearCart()
      await load()
    } catch (err) {
      setError(err.message || 'No se pudo registrar la venta')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-blush px-2 py-1 text-[10px] font-bold uppercase tracking-widest brutal-border">
            <ShoppingCart className="h-3 w-3" />
            Punto de venta
          </div>
          <h1 className="font-display text-4xl md:text-5xl">POS</h1>
          <p className="mt-2 text-ink/70 font-medium max-w-xl">
            Elige productos, arma el carrito y cobra en efectivo o tarjeta (incluye crédito parcial).
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

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, SKU…"
                className="pl-9"
                aria-label="Buscar productos"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-11 rounded-xl brutal-border bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-lavender"
              aria-label="Filtrar por categoría"
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {loading && (
            <div className="rounded-2xl brutal-border brutal-shadow bg-white/80 p-10 text-center font-display text-xl text-ink/50">
              Cargando productos…
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <Card className="bg-lavender/30">
              <CardContent className="py-10 text-center">
                <p className="font-display text-2xl">Sin productos</p>
                <p className="text-sm text-ink/60 font-medium mt-2">
                  {products.length === 0
                    ? 'Agrega productos en Inventario primero.'
                    : 'Prueba otra búsqueda o categoría.'}
                </p>
              </CardContent>
            </Card>
          )}

          {!loading && filtered.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((product) => {
                const out = Number(product.stock) <= 0
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={out}
                    onClick={() => openQty(product, undefined, null)}
                    className={`text-left rounded-2xl brutal-border brutal-shadow bg-white/90 overflow-hidden transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed`}
                  >
                    <div className="aspect-[4/3] bg-sky/20 border-b-[3px] border-ink relative flex items-center justify-center overflow-hidden">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-ink/25" />
                      )}
                      {out && (
                        <Badge className="absolute top-2 left-2 bg-coral">Sin stock</Badge>
                      )}
                    </div>
                    <div className="p-3 space-y-1">
                      <div className="font-display text-base line-clamp-2 leading-tight">
                        {product.name}
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-display text-lg">{formatMoney(product.price)}</span>
                        <span className="text-xs font-bold text-ink/50">
                          Stock {product.stock}
                          {product.unit ? ` ${product.unit}` : ''}
                        </span>
                      </div>
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
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 self-start">
          <Card className="bg-cream/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Carrito
                </span>
                {cart.length > 0 && (
                  <Badge className="bg-lemon">{cart.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 && (
                <p className="text-sm font-medium text-ink/50 py-4 text-center">
                  Toca un producto para agregarlo
                </p>
              )}
              {cart.map((ln) => (
                <div
                  key={ln.productId}
                  className="rounded-xl brutal-border bg-white p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="font-bold text-sm text-left hover:underline"
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
                      className="text-danger p-1"
                      aria-label={`Quitar ${ln.name}`}
                      onClick={() => removeLine(ln.productId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => bumpCartQty(ln.productId, -1)}
                        aria-label="Menos"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="min-w-[2.5rem] text-center text-sm font-bold">
                        {ln.qty}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => bumpCartQty(ln.productId, 1)}
                        aria-label="Más"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase text-ink/40">
                        {formatMoney(ln.price)} c/u
                      </div>
                      <div className="font-display text-base">
                        {formatMoney(ln.qty * ln.price)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="rounded-xl brutal-border bg-lemon/40 px-3 py-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-ink/60">
                  Total
                </span>
                <span className="font-display text-2xl">{formatMoney(cartTotal)}</span>
              </div>

              <div className="space-y-2 pt-1">
                <Label>Método de pago</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={paymentMethod === 'cash' ? 'lemon' : 'outline'}
                    size="sm"
                    onClick={() => setPaymentMethod('cash')}
                  >
                    <Banknote className="h-4 w-4" />
                    Efectivo
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === 'card' ? 'mint' : 'outline'}
                    size="sm"
                    onClick={() => setPaymentMethod('card')}
                  >
                    <CreditCard className="h-4 w-4" />
                    Tarjeta
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount-paid">Monto pagado</Label>
                <Input
                  id="amount-paid"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {paidValid && cart.length > 0 && (
                <div
                  className={`rounded-xl brutal-border px-3 py-2 text-sm font-bold ${
                    isCredito ? 'bg-coral/25' : 'bg-mint/50'
                  }`}
                >
                  {isCredito ? (
                    <span>Crédito (pendiente): {formatMoney(amountDue)}</span>
                  ) : (
                    <span>Cambio: {formatMoney(change)}</span>
                  )}
                </div>
              )}

              {isCredito && cart.length > 0 && (
                <div className="rounded-xl brutal-border bg-lavender/30 p-3">
                  <CustomerPicker
                    value={selectedCustomer}
                    onChange={(c) => {
                      setSelectedCustomer(c)
                      if (c) setError('')
                    }}
                    required={isCredito}
                  />
                </div>
              )}

              {cart.length > 0 && (
                <div className="rounded-xl brutal-border bg-sky/25 p-3">
                  <DriverPicker
                    value={selectedDriver}
                    onChange={setSelectedDriver}
                  />
                </div>
              )}

              <Button
                type="button"
                variant="primary"
                className="w-full"
                disabled={
                  cart.length === 0 ||
                  submitting ||
                  !paidValid ||
                  (isCredito && !selectedCustomer?.id)
                }
                onClick={onCheckout}
              >
                {submitting
                  ? 'Registrando…'
                  : isCredito && !selectedCustomer?.id
                    ? 'Selecciona cliente'
                    : 'Cobrar'}
              </Button>
              {cart.length > 0 && (
                <Button type="button" variant="ghost" className="w-full" onClick={clearCart}>
                  Vaciar carrito
                </Button>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

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

      <ReceiptModal
        open={receiptOpen}
        onClose={() => {
          setReceiptOpen(false)
          setReceiptSale(null)
        }}
        sale={receiptSale}
      />
    </div>
  )
}
