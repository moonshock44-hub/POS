const API_URL = import.meta.env.VITE_API_URL || ''

/** Surface FastAPI `detail` (string | validation array) — never silent. */
function errorMessage(data, fallback) {
  const d = data?.detail ?? data?.message
  if (typeof d === 'string' && d.trim()) return d
  if (Array.isArray(d)) {
    return d
      .map((e) => {
        if (typeof e === 'string') return e
        const loc = Array.isArray(e?.loc) ? e.loc.join('.') : ''
        const msg = e?.msg || e?.message || JSON.stringify(e)
        return loc ? `${loc}: ${msg}` : msg
      })
      .filter(Boolean)
      .join('; ')
  }
  if (d != null && typeof d === 'object') {
    try {
      return JSON.stringify(d)
    } catch {
      /* ignore */
    }
  }
  return fallback || 'Error de solicitud'
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  // Session via HttpOnly cookie (credentials: include). `auth` kept for call-site compat only.
  void auth
  const headers = { 'Content-Type': 'application/json' }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { detail: text }
  }
  if (!res.ok) {
    throw new Error(errorMessage(data, res.statusText || 'Error de solicitud'))
  }
  return data
}

/**
 * Multipart upload — do NOT set Content-Type (browser sets boundary).
 * Auth via HttpOnly session cookie (credentials: include), same as api().
 */
export async function uploadFile(path, file, { fieldName = 'file', auth = true } = {}) {
  void auth
  const headers = {}
  const form = new FormData()
  form.append(fieldName, file)
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: form,
  })
  let data = null
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { detail: text }
  }
  if (!res.ok) {
    throw new Error(errorMessage(data, res.statusText || 'Error de solicitud'))
  }
  return data
}

export const authApi = {
  login: (email, password) =>
    api('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (payload) =>
    api('/api/auth/register', { method: 'POST', body: payload, auth: true }),
  me: () => api('/api/auth/me'),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  health: () => api('/api/health', { auth: false }),
}

/*
 * F1 products contract (Sombra / JUA-8):
 * Product: { id, name, sku, category, unit, stock, price, cost, image_url, active, created_at, updated_at }
 * GET /api/products — active only; ?active=false includes inactive
 * GET/PUT/DELETE /api/products/{id} (DELETE = soft-delete active=false)
 * POST /api/products — JSON create
 * POST /api/products/upload — multipart field "file" → { image_url }
 * Never send Base64 in product JSON — upload first, then image_url only.
 * Stock bajo is UI-only (stock <= 5); no low_stock_threshold field.
 */
function normalizeList(data) {
  if (Array.isArray(data)) return data
  if (data?.items && Array.isArray(data.items)) return data.items
  return []
}

export const productsApi = {
  list: async ({ includeInactive = false } = {}) => {
    const q = includeInactive ? '?active=false' : ''
    const data = await api(`/api/products${q}`)
    return normalizeList(data)
  },
  get: (id) => api(`/api/products/${id}`),
  create: (payload) => api('/api/products', { method: 'POST', body: payload }),
  update: (id, payload) => api(`/api/products/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => api(`/api/products/${id}`, { method: 'DELETE' }),
  uploadImage: (file) =>
    uploadFile('/api/products/upload', file, { fieldName: 'file' }),
}

/*
 * F3 customers / CxC (Sombra / JUA-10):
 * Customer: { id, name, phone, email|null, notes|null, balance, active, created_at, updated_at }
 * Never send balance on create/update — server-derived.
 * GET /api/customers — active only; ?active=false includes inactive (bare array or {items})
 * GET/PUT/DELETE /api/customers/{id} (DELETE = soft-delete)
 * POST /api/customers — { name, phone, email?, notes?, active? }
 * GET /api/customers/{id}/account → { customer, open_sales, payments }
 *   (aliases sales/abonos accepted if present)
 * POST /api/customers/{id}/payments — { amount, payment_method: cash|card, note? }
 *   → PaymentPublic: { id, customer_id, amount, payment_method, note, applied_to, balance_after, … }
 */
export const customersApi = {
  list: async ({ includeInactive = false } = {}) => {
    const q = includeInactive ? '?active=false' : ''
    const data = await api(`/api/customers${q}`)
    return normalizeList(data)
  },
  get: (id) => api(`/api/customers/${id}`),
  create: (payload) => api('/api/customers', { method: 'POST', body: payload }),
  update: (id, payload) => api(`/api/customers/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => api(`/api/customers/${id}`, { method: 'DELETE' }),
  account: (id) => api(`/api/customers/${id}/account`),
  pay: (id, payload) =>
    api(`/api/customers/${id}/payments`, { method: 'POST', body: payload }),
}

/*
 * F2/F3/F5/F8 sales (Sombra / JUA-9 + JUA-10 + JUA-12 + JUA-16 Historial):
 * POST /api/sales — optional customer_id (REQUIRED when amount_paid < total)
 *   optional delivery_driver_id + delivery_status (pending|assigned|out|delivered|cancelled)
 * GET /api/sales — list SalePublic[] (newest first). Query (all optional):
 *   from, to — YYYY-MM-DD (America/Mexico_City days, inclusive)
 *   payment_method — cash|card
 *   payment_status — paid|partial
 *   customer_id
 *   delivery_status, delivery_driver_id, with_delivery=true (F5)
 *   limit (default 100), skip
 * GET /api/sales/{id} — one SalePublic (ticket detail)
 * GET /api/sales/receivables — list of partial sales (global CxC)
 * PATCH /api/sales/{id}/delivery — { delivery_driver_id?, delivery_status? }
 * SalePublic lines may only have product_id (no name) — resolve via productsApi.
 */
export const salesApi = {
  create: ({
    lines,
    payment_method,
    amount_paid,
    customer_id,
    delivery_driver_id,
    delivery_status,
  }) => {
    const body = { lines, payment_method, amount_paid }
    if (customer_id != null && customer_id !== '') {
      body.customer_id = customer_id
    }
    if (delivery_driver_id != null && delivery_driver_id !== '') {
      body.delivery_driver_id = delivery_driver_id
      body.delivery_status = delivery_status || 'assigned'
    } else if (delivery_status != null && delivery_status !== '') {
      body.delivery_status = delivery_status
    }
    return api('/api/sales', { method: 'POST', body })
  },
  list: async ({
    from,
    to,
    payment_method,
    payment_status,
    customer_id,
    with_delivery,
    delivery_status,
    delivery_driver_id,
    limit,
    skip,
  } = {}) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (payment_method) params.set('payment_method', payment_method)
    if (payment_status) params.set('payment_status', payment_status)
    if (customer_id) params.set('customer_id', customer_id)
    if (with_delivery) params.set('with_delivery', 'true')
    if (delivery_status) params.set('delivery_status', delivery_status)
    if (delivery_driver_id) params.set('delivery_driver_id', delivery_driver_id)
    if (limit != null) params.set('limit', String(limit))
    if (skip != null) params.set('skip', String(skip))
    const q = params.toString() ? `?${params}` : ''
    const data = await api(`/api/sales${q}`)
    return normalizeList(data)
  },
  /** F8 Historial — single sale ticket. */
  get: (id) => api(`/api/sales/${id}`),
  receivables: async () => {
    const data = await api('/api/sales/receivables')
    return normalizeList(data)
  },
  /** Post-sale delivery assignment (F5). */
  updateDelivery: (id, { delivery_driver_id, delivery_status } = {}) => {
    const body = {}
    if (delivery_driver_id !== undefined) body.delivery_driver_id = delivery_driver_id
    if (delivery_status !== undefined) body.delivery_status = delivery_status
    return api(`/api/sales/${id}/delivery`, { method: 'PATCH', body })
  },
}

/*
 * F4 Kiosko (Odysseo / JUA-11) — CONTRACT.md + models/kiosk_order.py
 * POST /api/kiosk/orders — auth:false
 *   body: { lines: [{ product_id, qty }], customer_name?, note? }
 *   prices are server-side — never send price on create
 * GET /api/kiosk/orders?status=pending — auth:true → KioskOrderPublic[]
 * GET /api/kiosk/orders/pending/count — auth:true → { count }
 * POST /api/kiosk/orders/{id}/fulfill — auth:true
 *   body: { payment_method: cash|card, amount_paid, customer_id? }
 *   → { order, sale }  (creates sale + decrements stock; NOT raw POST /api/sales)
 * Catalog for public kiosk: GET /api/kiosk/products auth:false (active only, no cost)
 */
export const kioskApi = {
  products: async () => {
    const data = await api('/api/kiosk/products', { auth: false })
    return normalizeList(data)
  },
  createOrder: ({ lines, customer_name, note }) => {
    const body = { lines }
    if (customer_name != null && String(customer_name).trim() !== '') {
      body.customer_name = String(customer_name).trim()
    }
    if (note != null && String(note).trim() !== '') {
      body.note = String(note).trim()
    }
    return api('/api/kiosk/orders', { method: 'POST', body, auth: false })
  },
  pendingCount: async () => {
    const data = await api('/api/kiosk/orders/pending/count')
    const n = Number(data?.count)
    return Number.isFinite(n) ? n : 0
  },
  listPending: async () => {
    const data = await api('/api/kiosk/orders?status=pending')
    return normalizeList(data)
  },
  /** Cashier fulfill — never call salesApi.create for kiosk orders. */
  fulfill: (orderId, { payment_method, amount_paid, customer_id } = {}) => {
    const body = { payment_method, amount_paid }
    if (customer_id != null && customer_id !== '') {
      body.customer_id = customer_id
    }
    return api(`/api/kiosk/orders/${orderId}/fulfill`, { method: 'POST', body })
  },
}

/*
 * F5 Drivers / repartidores (Sombra / JUA-12) — path is /api/deliveries
 * Driver: { id, name, phone, notes, active, created_at, updated_at }
 * GET    /api/deliveries — active only; ?active=false includes inactive
 * GET    /api/deliveries/{id}
 * POST   /api/deliveries — { name, phone?, notes?, active? }
 * PUT    /api/deliveries/{id}
 * DELETE /api/deliveries/{id} — soft-delete active=false
 * Sale delivery fields live on sales (delivery_driver_id, delivery_status), not here.
 */
export const driversApi = {
  list: async ({ includeInactive = false } = {}) => {
    const q = includeInactive ? '?active=false' : ''
    const data = await api(`/api/deliveries${q}`)
    return normalizeList(data)
  },
  get: (id) => api(`/api/deliveries/${id}`),
  create: (payload) => api('/api/deliveries', { method: 'POST', body: payload }),
  update: (id, payload) => api(`/api/deliveries/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => api(`/api/deliveries/${id}`, { method: 'DELETE' }),
}

/*
 * F6 Settings (Sombra / JUA-15) — CONTRACT locked:
 * {
 *   id, business_name,
 *   brand: { primary_color, secondary_color, accent_color },
 *   kiosk: { welcome_text, logo_url },
 *   ticket: { footer, show_sku, show_change },
 *   whatsapp: { enabled, default_country_code, message_template },
 *   updated_at
 * }
 * GET /api/settings — JWT; seeds defaults if missing
 * PUT /api/settings — full replace
 * PATCH /api/settings — partial
 */
export const settingsApi = {
  get: () => api('/api/settings'),
  put: (payload) => api('/api/settings', { method: 'PUT', body: payload }),
  patch: (payload) => api('/api/settings', { method: 'PATCH', body: payload }),
}

/*
 * F7 Dashboard (JUA-13) — Odysseo canon:
 * GET /api/dashboard/summary?from=&to=&threshold=5
 * {
 *   from, to,
 *   sales: {
 *     today:  { count, gross_total, amount_paid_total, amount_due_total },
 *     month:  { count, gross_total, amount_paid_total, amount_due_total },
 *     range:  { count, gross_total, amount_paid_total, amount_due_total }
 *   },
 *   payment_methods: [{ method, count, gross_total, amount_paid_total }],
 *   products: {
 *     top:   [{ product_id, name, sku, qty_sold, revenue }],
 *     least: [{ product_id, name, sku, qty_sold, revenue }]
 *   },
 *   cxc: { open_count, open_balance },
 *   inventory: { low_stock_count, low_stock_threshold, items: [{id,name,sku,stock,unit}] },
 *   series: [{ date, count, gross_total }]
 * }
 * Default date range: current calendar month in America/Mexico_City.
 */
function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function mapProductRow(it) {
  return {
    id: it?.product_id ?? it?.id ?? null,
    name: it?.name ?? '—',
    sku: it?.sku ?? '',
    qty: num(it?.qty_sold),
    revenue: num(it?.revenue),
  }
}

function mapLowStockItem(it) {
  return {
    id: it?.id ?? null,
    name: it?.name ?? '—',
    sku: it?.sku ?? '',
    stock: num(it?.stock),
    unit: it?.unit ?? 'pza',
  }
}

/** Normalize Odysseo dashboard summary → internal UI shape. */
export function normalizeDashboardSummary(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  const sales = data.sales && typeof data.sales === 'object' ? data.sales : {}
  const today = sales.today && typeof sales.today === 'object' ? sales.today : {}
  const month = sales.month && typeof sales.month === 'object' ? sales.month : {}
  const range = sales.range && typeof sales.range === 'object' ? sales.range : {}
  const products = data.products && typeof data.products === 'object' ? data.products : {}
  const inventory =
    data.inventory && typeof data.inventory === 'object' ? data.inventory : {}
  const cxc = data.cxc && typeof data.cxc === 'object' ? data.cxc : {}

  const seriesRaw = Array.isArray(data.series) ? data.series : []
  const paymentRaw = Array.isArray(data.payment_methods) ? data.payment_methods : []
  const topRaw = Array.isArray(products.top) ? products.top : []
  const leastRaw = Array.isArray(products.least) ? products.least : []
  const lowItemsRaw = Array.isArray(inventory.items) ? inventory.items : []

  return {
    from: data.from ?? null,
    to: data.to ?? null,
    kpis: {
      todayCount: num(today.count),
      todayGross: num(today.gross_total),
      monthCount: num(month.count),
      monthGross: num(month.gross_total),
      rangeCount: num(range.count),
      rangeGross: num(range.gross_total),
      paid: num(range.amount_paid_total),
      due: num(range.amount_due_total),
      cxcOpen: num(cxc.open_count),
      cxcBalance: num(cxc.open_balance),
      lowStock: num(inventory.low_stock_count, lowItemsRaw.length),
      lowStockThreshold: num(inventory.low_stock_threshold, 5),
    },
    series: seriesRaw.map((s) => ({
      date: s?.date ?? '',
      count: num(s?.count),
      gross: num(s?.gross_total),
    })),
    paymentMethods: paymentRaw.map((p) => ({
      method: String(p?.method ?? 'other'),
      count: num(p?.count),
      gross: num(p?.gross_total),
    })),
    top: topRaw.map(mapProductRow),
    least: leastRaw.map(mapProductRow),
    lowStockItems: lowItemsRaw.map(mapLowStockItem),
  }
}

export const dashboardApi = {
  summary: async ({ from, to, threshold = 5 } = {}) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (threshold != null && threshold !== '') {
      params.set('threshold', String(threshold))
    }
    const q = params.toString() ? `?${params}` : ''
    const data = await api(`/api/dashboard/summary${q}`)
    return normalizeDashboardSummary(data)
  },
}

/*
 * F10 Despacho (Sombra / JUA-20) — NOT Entregas (/api/deliveries).
 * GET  /api/despacho?status=pending|ready → DispatchPublic[] (or {items})
 * GET  /api/despacho/{id}
 * PATCH /api/despacho/{id} — body { status: "pending"|"ready" } (both directions)
 * Shape: { id, folio, sale_id, origin: "caja"|"kiosko", status, lines: [{product_id,name?,qty}], created_at, updated_at }
 * UI roles: admin|despacho only (cajero blocked in frontend route guard).
 */
export const despachoApi = {
  list: async ({ status } = {}) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    const q = params.toString() ? `?${params}` : ''
    const data = await api(`/api/despacho${q}`)
    return normalizeList(data)
  },
  get: (id) => api(`/api/despacho/${id}`),
  updateStatus: (id, status) =>
    api(`/api/despacho/${id}`, { method: 'PATCH', body: { status } }),
}
