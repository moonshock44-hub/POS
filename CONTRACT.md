# POS Tienditas API Contract (F1–F8 + F10 Despacho + JUA-17 security)

## Session & Auth (JUA-17)

**Web SPA session = HttpOnly cookie only.** Login/register responses do **not** include `access_token` in the JSON body. The SPA must not store JWTs in `localStorage`.

| Mechanism | Use |
|-----------|-----|
| Cookie `access_token` (HttpOnly) | **Primary** for browser clients (`credentials: include`) |
| `Authorization: Bearer <jwt>` | **Smoke/scripts/curl only** — still accepted by `get_current_user` as fallback |

Cookie flags: `HttpOnly`; `Secure` + `SameSite=None` when `COOKIE_SECURE=true` (HTTPS); local HTTP uses `Secure=false` + `SameSite=Lax`.

Default JWT TTL: **`JWT_EXPIRE_MINUTES=720`** (12h). See `app/backend/.env.example` SECURITY checklist (rotate `JWT_SECRET`, seed admin password, MinIO keys).

### Auth endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/auth/login` | public | Sets HttpOnly cookie; body = `{ user }` (**no** `access_token`). Rate-limit ~**5/min/IP** → **429** |
| `POST` | `/api/auth/register` | **JWT admin** | Creates `admin`\|`cajero`\|`despacho`; body = `{ user }` only; does not steal admin cookie. Rate-limit ~**3/min/IP** → **429**. Non-admin → **403** |
| `GET` | `/api/auth/me` | session | Current user |
| `POST` | `/api/auth/logout` | session | Clears cookie |

Seed admin still boots from env (`SEED_ADMIN_*`) on startup.

Smoke scripts: use curl cookie jars (`-c`/`-b`) after login. Do not expect `access_token` in JSON.

### RBAC (cajero vs admin vs despacho)

| Capability | cajero | admin | despacho |
|------------|--------|-------|----------|
| Read products | yes — **`cost` omitted** | yes — includes `cost` | **403** |
| Create/update/delete products + upload | **403** | yes (upload rate-limited) | **403** |
| Sales, customers/CxC, deliveries, kiosk staff, historial, dashboard | yes | yes | **403** |
| `GET`/`PATCH` `/api/despacho` (F10) | **403** | yes | yes |
| `GET /api/settings` | yes | yes | **403** |
| `PUT`/`PATCH /api/settings` | **403** | yes (rate-limited) | **403** |
| `POST /api/auth/register` | **403** | yes | **403** |
| `GET /api/auth/me`, `POST /api/auth/logout` | yes | yes | yes |

Public (no auth): `POST /api/kiosk/orders`, `GET /api/kiosk/products` (no `cost`).

Server gate: `require_despacho_access` → **admin\|despacho** for `/api/despacho`. Other staff APIs reject `role==despacho` (Cortana RBAC / `require_cashier_access` or equivalent). Product mutate + settings write stay `require_admin`.

### Rate limits (in-memory per IP)

Defaults from env (`0` disables that bucket):

| Bucket | Default / min | Applied on |
|--------|---------------|------------|
| `RATE_LIMIT_LOGIN_PER_MIN` | 5 | `POST /api/auth/login` |
| `RATE_LIMIT_REGISTER_PER_MIN` | 3 | `POST /api/auth/register` |
| `RATE_LIMIT_SETTINGS_WRITE_PER_MIN` | 10 | settings PUT/PATCH |
| `RATE_LIMIT_UPLOAD_PER_MIN` | 10 | `POST /api/products/upload` |

Exceeded → **429** `{ "detail": "Demasiados intentos..." }`.

---
## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/products` | List products. Default: only `active=true`. Query `?active=false` includes inactive. |
| `GET` | `/api/products/{id}` | Get one product by id |
| `POST` | `/api/products` | Create product (JSON body) |
| `PUT` | `/api/products/{id}` | Full update (JSON body) |
| `DELETE` | `/api/products/{id}` | Soft-delete → sets `active=false` |
| `POST` | `/api/products/upload` | Multipart image upload → `{ "image_url": "..." }` |

### Query params

- `GET /api/products?active=true` (default) — only active products
- `GET /api/products?active=false` — include inactive (all products)

---

## Product JSON (response)

```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Coca-Cola 600ml",
  "sku": "COCA-600",
  "category": "Bebidas",
  "unit": "pza",
  "stock": 24,
  "price": 18.5,
  "cost": 12.0,
  "image_url": "http://127.0.0.1:9000/pos-tienditas/products/abc123.jpg",
  "active": true,
  "created_at": "2026-09-14T16:00:00Z",
  "updated_at": "2026-09-14T16:00:00Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | PyObjectId → str (never raw ObjectId) |
| `name` | string | |
| `sku` | string | unique |
| `category` | string | |
| `unit` | string | e.g. `pza`, `kg`, `lt` |
| `stock` | number | |
| `price` | number | |
| `cost` | number | **Admin only** in responses. Cajero reads omit `cost` (JUA-17). |
| `image_url` | string \| null | Object storage URL only |
| `active` | bool | soft-delete flag |
| `created_at` | datetime \| null | |
| `updated_at` | datetime \| null | |

**No** `low_stock_threshold` in backend.

---

## Create / Update body (JSON)

```json
{
  "name": "Coca-Cola 600ml",
  "sku": "COCA-600",
  "category": "Bebidas",
  "unit": "pza",
  "stock": 24,
  "price": 18.5,
  "cost": 12.0,
  "image_url": null,
  "active": true
}
```

- `active` optional on create (default `true`)
- Full update on PUT (all fields expected)
- Typical flow: `POST /api/products/upload` → take `image_url` → pass in create/update JSON

---

## Upload

`POST /api/products/upload`

- Content-Type: `multipart/form-data`
- Field name: **`file`** (required)
- Allowed: jpeg, png, webp, gif (max 5 MB)
- Response:

```json
{ "image_url": "http://127.0.0.1:9000/pos-tienditas/products/<uuid>.jpg" }
```

---

## Errors (typical)

- `401` — not authenticated
- `400` — invalid id / duplicate SKU / bad file type
- `404` — product not found
- `502` — object storage unavailable

---

## Curl examples

```bash
TOKEN=$(curl -sf -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Upload
curl -sf -X POST http://127.0.0.1:8000/api/products/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./sample.png"

# Create
curl -sf -X POST http://127.0.0.1:8000/api/products \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Agua 1L","sku":"AGUA-1L","category":"Bebidas","unit":"pza","stock":40,"price":12,"cost":7,"image_url":null,"active":true}'

# List
curl -sf http://127.0.0.1:8000/api/products -H "Authorization: Bearer $TOKEN"

# Soft-delete
curl -sf -X DELETE http://127.0.0.1:8000/api/products/<id> -H "Authorization: Bearer $TOKEN"
```


---

# Sales (F2 Ventas / JUA-9)

Auth: same as products — **Bearer** or cookie `access_token` via `get_current_user`.

## Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sales` | Create sale; atomically decrement stock; record payment; optional/required `customer_id` |
| `GET` | `/api/sales/receivables` | List sales with `payment_status=partial`. Optional `?customer_id=` |

## Request body

```json
{
  "lines": [
    { "product_id": "507f1f77bcf86cd799439011", "qty": 2, "price": 18.5 }
  ],
  "payment_method": "cash",
  "amount_paid": 37.0,
  "customer_id": null
}
```

| Field | Type | Rules |
|-------|------|-------|
| `lines` | array | min 1 item |
| `lines[].product_id` | string | existing product id |
| `lines[].qty` | number | `> 0` |
| `lines[].price` | number | `>= 0` (unit price; backend computes totals) |
| `payment_method` | string | `"cash"` \| `"card"` |
| `amount_paid` | number | `>= 0` |
| `customer_id` | string \| null | **Required** when `amount_paid < total` (crédito). Optional when paid. Customer must exist and be `active`. |
| `delivery_driver_id` | string \| null | Optional (F5). Id of repartidor in `/api/deliveries`. Must exist and be `active` when set. |
| `delivery_status` | string \| null | Optional (F5): `pending`\|`assigned`\|`out`\|`delivered`\|`cancelled`. If driver set and status omitted → defaults to `assigned`. |

Backend computes:

- `line_total = qty * price` per line
- `total = sum(line_total)`
- Payment:
  - if `amount_paid >= total` → `payment_status = "paid"`, `amount_due = 0`, `change = amount_paid - total`
  - if `0 <= amount_paid < total` → `payment_status = "partial"` (crédito), `amount_due = total - amount_paid`, `change = 0`; **requires** `customer_id`; increments `customer.balance` by `amount_due` atomically with sale create

## Response `201`

```json
{
  "id": "507f1f77bcf86cd799439012",
  "lines": [
    {
      "product_id": "507f1f77bcf86cd799439011",
      "qty": 2,
      "price": 18.5,
      "line_total": 37.0
    }
  ],
  "total": 37.0,
  "payment_method": "cash",
  "amount_paid": 40.0,
  "amount_due": 0.0,
  "payment_status": "paid",
  "change": 3.0,
  "customer_id": null,
  "delivery_driver_id": null,
  "delivery_status": null,
  "created_at": "2026-09-14T16:00:00Z",
  "created_by": "507f1f77bcf86cd799439000"
}
```

All ids are **strings** (PyObjectId) — never raw ObjectId in JSON. `customer_id`, `delivery_driver_id`, and `delivery_status` are nullable.

## Atomic stock

Per line, stock is decremented with `findOneAndUpdate` conditioned on `active=true` and `stock >= qty`.

- Unknown `product_id` → **404**
- Inactive product or insufficient stock → **400**
- If any line fails: **no sale is persisted** and any prior stock decrements in that request are **rolled back** (compensating `$inc`). Standalone Mongo (no replica set) does not support multi-doc transactions; this pattern guarantees no partial sale.

## Errors

| Code | When |
|------|------|
| `401` | not authenticated |
| `400` | inactive product, insufficient stock, partial without `customer_id`, inactive customer, validation |
| `404` | unknown / invalid `product_id` or `customer_id` |
| `422` | Pydantic validation (e.g. missing fields) |

## Curl example

```bash
TOKEN=$(curl -sf -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Assume PRODUCT_ID from a prior create
curl -sf -X POST http://127.0.0.1:8000/api/sales \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{"lines":[{\"product_id\":\"$PRODUCT_ID\",\"qty\":2,\"price\":18.5}],\"payment_method\":\"cash\",\"amount_paid\":40}"
```


---

# Customers / CxC (F3 / JUA-10)

Auth: same — **Bearer** or cookie `access_token` via `get_current_user`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/customers` | List customers. Default: only `active=true`. Query `?active=false` includes inactive. |
| `GET` | `/api/customers/{id}` | Get one customer |
| `POST` | `/api/customers` | Create customer |
| `PUT` | `/api/customers/{id}` | Full update of name/phone/email/notes/active (**not** balance) |
| `DELETE` | `/api/customers/{id}` | Soft-delete → `active=false` |
| `POST` | `/api/customers/{id}/payments` | Abono CxC — reduce balance, FIFO apply to partial sales |
| `GET` | `/api/customers/{id}/account` | Customer + open partial sales + recent payments |
| `GET` | `/api/sales/receivables` | All partial sales; optional `?customer_id=` |

## Customer JSON (response)

```json
{
  "id": "507f1f77bcf86cd799439020",
  "name": "Juan Pérez",
  "phone": "5512345678",
  "email": "juan@example.com",
  "notes": null,
  "balance": 85.5,
  "active": true,
  "created_at": "2026-09-14T16:00:00Z",
  "updated_at": "2026-09-14T16:00:00Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | PyObjectId → str |
| `name` | string | |
| `phone` | string | indexed |
| `email` | string \| null | |
| `notes` | string \| null | |
| `balance` | number (float) | CxC owed; updated by partial sales (+) and payments (−); never set via PUT |
| `active` | bool | soft-delete flag |
| `created_at` / `updated_at` | datetime \| null | |

### Create / Update body

```json
{
  "name": "Juan Pérez",
  "phone": "5512345678",
  "email": "juan@example.com",
  "notes": null,
  "active": true
}
```

- `email`, `notes` optional; `active` optional on create (default `true`)
- PUT is full update of those fields — **balance is not writable**

## Payments (abonos)

`POST /api/customers/{id}/payments`

```json
{ "amount": 50.0, "payment_method": "cash", "note": "Abono parcial" }
```

| Field | Rules |
|-------|-------|
| `amount` | `> 0`; **400** if `amount > customer.balance` (no overpay) |
| `payment_method` | `"cash"` \| `"card"` |
| `note` | optional string \| null |

Behavior:

1. Atomically decrement `customer.balance` by `amount` (conditioned on `balance >= amount` and `active`)
2. FIFO apply to that customer's sales with `payment_status=partial` (oldest `created_at` first): increase `amount_paid`, decrease `amount_due`; set `paid` when `amount_due` hits 0
3. Persist payment doc

### Payment response

```json
{
  "id": "507f1f77bcf86cd799439030",
  "customer_id": "507f1f77bcf86cd799439020",
  "amount": 50.0,
  "payment_method": "cash",
  "note": "Abono parcial",
  "applied_to": [{ "sale_id": "507f1f77bcf86cd799439012", "amount": 50.0 }],
  "balance_after": 35.5,
  "created_at": "2026-09-14T17:00:00Z",
  "created_by": "507f1f77bcf86cd799439000"
}
```

## Account statement

`GET /api/customers/{id}/account` → `{ "customer": CustomerPublic, "open_sales": SalePublic[], "payments": PaymentPublic[] }`

- `open_sales`: that customer's sales with `payment_status=partial`
- `payments`: recent payments (newest first, capped)

## Receivables

`GET /api/sales/receivables` — all sales with `payment_status=partial`, sorted by `created_at` ascending. Optional `?customer_id=` filter.

## Atomicity (standalone Mongo)

No multi-doc transactions. Patterns:

- **Partial sale create**: stock decrements (conditional `findOneAndUpdate`) + `customer.balance += amount_due` + sale insert; compensating rollback of stock and balance on failure
- **Payment**: conditional `balance` decrement + FIFO sale updates + payment insert; compensating restore of sales + balance on failure

## Indexes

- `customers.phone`, `customers.active`
- `sales (customer_id, payment_status)`
- `customer_payments (customer_id, created_at)`

## Errors (customers / CxC)

| Code | When |
|------|------|
| `401` | not authenticated |
| `400` | invalid id, inactive customer, amount > balance, amount ≤ 0, partial sale without customer |
| `404` | customer / sale product not found |
| `422` | Pydantic validation |

## Curl examples

```bash
TOKEN=$(curl -sf -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Create customer
curl -sf -X POST http://127.0.0.1:8000/api/customers \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Juan Pérez","phone":"5512345678","email":null,"notes":null,"active":true}'

# Partial sale (crédito) — customer_id required
curl -sf -X POST http://127.0.0.1:8000/api/sales \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"lines":[{"product_id":"PRODUCT_ID","qty":2,"price":18.5}],"payment_method":"cash","amount_paid":10,"customer_id":"CUSTOMER_ID"}'

# Abono
curl -sf -X POST http://127.0.0.1:8000/api/customers/CUSTOMER_ID/payments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"amount":20,"payment_method":"cash","note":"Abono"}'

# Receivables
curl -sf "http://127.0.0.1:8000/api/sales/receivables" -H "Authorization: Bearer $TOKEN"
```


---

# Kiosk (F4 / JUA-11)

**Public vs cajero auth:**

| Endpoint | Auth |
|----------|------|
| `GET /api/kiosk/products` | **Public — NO JWT** (catalogo kiosko; **sin `cost`**) |
| `POST /api/kiosk/orders` | **Public — NO JWT** (kiosk terminal) |
| `GET /api/kiosk/orders/pending/count` | **JWT** (`get_current_user` — cajero/admin) |
| `GET /api/kiosk/orders?status=pending` | **JWT** (cajero list) |
| `POST /api/kiosk/orders/{id}/fulfill` | **JWT** (cajero fulfills → real sale) |
| `POST /api/kiosk/orders/{id}/cancel` | **JWT** (cancel pending) |

## Public catalog `GET /api/kiosk/products`

No JWT. Returns only **active** products. Response item (`KioskProductPublic`):

```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Coca-Cola 600ml",
  "sku": "COCA-600",
  "category": "Bebidas",
  "unit": "pza",
  "stock": 24,
  "price": 18.5,
  "image_url": "http://127.0.0.1:9000/pos-tienditas/products/abc123.jpg",
  "active": true
}
```

**No `cost` field** (and no cost in JSON). Staff inventory with cost remains on authenticated `/api/products`.

Stock is **NOT** decremented on create — only when the cashier **fulfills** (via shared `create_sale_atomic`, same rules as `POST /api/sales`).

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/kiosk/products` | public | Active products for kiosk UI — **omits `cost`** (full product w/ cost: auth `GET /api/products`) |
| `POST` | `/api/kiosk/orders` | public | Create pending kiosk order |
| `GET` | `/api/kiosk/orders/pending/count` | JWT | `{ "count": N }` where `status==pending` |
| `GET` | `/api/kiosk/orders` | JWT | List orders; optional `?status=pending\|fulfilled\|cancelled` |
| `POST` | `/api/kiosk/orders/{id}/fulfill` | JWT | Create sale + mark `fulfilled`, store `sale_id` |
| `POST` | `/api/kiosk/orders/{id}/cancel` | JWT | Mark `cancelled` (only if pending) |

## Create body (public)

```json
{
  "lines": [{ "product_id": "507f1f77bcf86cd799439011", "qty": 2 }],
  "customer_name": "María",
  "note": "Sin cebolla"
}
```

| Field | Rules |
|-------|-------|
| `lines` | min 1; `product_id` string; `qty` > 0 |
| `customer_name` | string \| null |
| `note` | string \| null |

Rules:

- Products must exist and be `active` (unknown → **404**, inactive → **400**)
- Unit **price from server** `product.price` (client prices ignored / not accepted)
- `line_total = qty * price`; `total = sum(line_total)`
- `status = "pending"`
- **Do not** decrement stock on create

### Response `201`

```json
{
  "id": "507f1f77bcf86cd799439040",
  "lines": [
    {
      "product_id": "507f1f77bcf86cd799439011",
      "product_name": "Coca-Cola 600ml",
      "qty": 2,
      "price": 18.5,
      "line_total": 37.0
    }
  ],
  "total": 37.0,
  "customer_name": "María",
  "note": "Sin cebolla",
  "status": "pending",
  "sale_id": null,
  "created_at": "2026-09-14T17:00:00Z"
}
```

All ids are **strings** (PyObjectId → str).

## Pending count (JWT)

`GET /api/kiosk/orders/pending/count` → `{ "count": 3 }`

## List (JWT)

`GET /api/kiosk/orders?status=pending` — sorted by `created_at` ascending. Omit `status` to list all.

## Fulfill (JWT)

`POST /api/kiosk/orders/{id}/fulfill`

```json
{ "payment_method": "cash", "amount_paid": 40.0, "customer_id": null }
```

Same payment / stock / CxC rules as `POST /api/sales` (shared helper). Uses snapshotted line prices from the kiosk order.

- Order must be `pending` else **400**
- On success: creates sale (stock decremented), sets order `status=fulfilled`, `sale_id=<sale id>`
- Response: `{ "order": KioskOrderPublic, "sale": SalePublic }`

## Cancel (JWT)

`POST /api/kiosk/orders/{id}/cancel` — only `pending` → `cancelled`. No stock change (none was held).

## Indexes

- `kiosk_orders.status`
- `kiosk_orders.created_at`
- `kiosk_orders (status, created_at)`

## Errors

| Code | When |
|------|------|
| `401` | JWT endpoints without auth |
| `400` | inactive product, invalid status, order not pending, payment/CxC validation |
| `404` | unknown product / order |
| `409` | concurrent fulfill race |
| `422` | Pydantic validation |

## Curl examples

```bash
# Public create (no token)
curl -sf -X POST http://127.0.0.1:8000/api/kiosk/orders   -H 'Content-Type: application/json'   -d '{"lines":[{"product_id":"PRODUCT_ID","qty":2}],"customer_name":"María","note":null}'

TOKEN=$(curl -sf -X POST http://127.0.0.1:8000/api/auth/login   -H 'Content-Type: application/json'   -d '{"email":"admin@tienditas.com","password":"Admin123!"}'   | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -sf http://127.0.0.1:8000/api/kiosk/orders/pending/count -H "Authorization: Bearer $TOKEN"
curl -sf "http://127.0.0.1:8000/api/kiosk/orders?status=pending" -H "Authorization: Bearer $TOKEN"

curl -sf -X POST http://127.0.0.1:8000/api/kiosk/orders/ORDER_ID/fulfill   -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json'   -d '{"payment_method":"cash","amount_paid":40,"customer_id":null}'
```

---

# Deliveries / Repartidores (F5 / JUA-12)

**Note:** `/api/deliveries` is CRUD for **drivers (repartidores)**, not delivery-order documents. Sale delivery assignment lives on the sale itself (`delivery_driver_id`, `delivery_status`).

Auth: all endpoints require JWT (`get_current_user`).

## Driver endpoints (`/api/deliveries`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/deliveries` | List drivers. Default: only `active=true`. Query `?active=false` includes inactive. |
| `GET` | `/api/deliveries/{id}` | Get one driver |
| `POST` | `/api/deliveries` | Create driver |
| `PUT` | `/api/deliveries/{id}` | Full update |
| `DELETE` | `/api/deliveries/{id}` | Soft-delete → `active=false` |

### Driver JSON (response)

```json
{
  "id": "507f1f77bcf86cd799439050",
  "name": "Juan Pérez",
  "phone": "5512345678",
  "notes": "Moto",
  "active": true,
  "created_at": "2026-09-14T18:00:00Z",
  "updated_at": "2026-09-14T18:00:00Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | PyObjectId → str |
| `name` | string | required, non-empty |
| `phone` | string \| null | optional |
| `notes` | string \| null | optional |
| `active` | bool | default true; soft-delete sets false |
| `created_at` / `updated_at` | datetime | UTC |

### Create / Update body

```json
{ "name": "Juan Pérez", "phone": "5512345678", "notes": "Moto", "active": true }
```

## Sale delivery fields

On every `SalePublic` (create response, receivables, etc.):

| Field | Type | Notes |
|-------|------|-------|
| `delivery_driver_id` | string \| null | FK to `/api/deliveries` driver id |
| `delivery_status` | string \| null | `pending`\|`assigned`\|`out`\|`delivered`\|`cancelled` |

Optional on `POST /api/sales` (same fields). If `delivery_driver_id` is set and `delivery_status` omitted, status defaults to `assigned`.

### `PATCH /api/sales/{id}/delivery`

```json
{ "delivery_driver_id": "507f1f77bcf86cd799439050", "delivery_status": "out" }
```

- Either or both fields may be sent (`exclude_unset`).
- Non-null `delivery_driver_id` → driver must **exist** and be **active** (else 404 / 400).
- Pass `"delivery_driver_id": null` to clear the driver.
- Pass `"delivery_status": null` to clear status.


### List sales (board)

`GET /api/sales` — JWT. Newest first. Delivery filters (F5); full Historial filters in **F8**.

Query (delivery):
- `delivery_status` — `pending|assigned|out|delivered|cancelled`
- `delivery_driver_id` — filter by repartidor id
- `with_delivery=true` — only sales with `delivery_status` or `delivery_driver_id` set
- `limit` — default 100 (max 500); `skip` — default 0

Response: `SalePublic[]`.

```bash
curl -sf 'http://127.0.0.1:8000/api/sales?with_delivery=true' -H "Authorization: Bearer $TOKEN"
curl -sf 'http://127.0.0.1:8000/api/sales?delivery_status=assigned' -H "Authorization: Bearer $TOKEN"
```

## Indexes

- `deliveries.active`
- `deliveries.name`
- `sales.delivery_driver_id`
- `sales.delivery_status`

## Errors

| Code | When |
|------|------|
| `401` | missing/invalid JWT |
| `400` | invalid id format, inactive driver, empty name |
| `404` | unknown driver / sale |
| `422` | Pydantic validation |

## Curl examples

```bash
TOKEN=$(curl -sf -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -sf -X POST http://127.0.0.1:8000/api/deliveries \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Juan Pérez","phone":"5512345678","notes":null,"active":true}'

curl -sf http://127.0.0.1:8000/api/deliveries -H "Authorization: Bearer $TOKEN"

curl -sf -X PATCH http://127.0.0.1:8000/api/sales/SALE_ID/delivery \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"delivery_driver_id":"DRIVER_ID","delivery_status":"assigned"}'
```


---

# Settings (F6 / JUA-15)

Auth: **Bearer** or cookie `access_token` via `get_current_user`.

Singleton Mongo collection `settings` (one document). `id` is PyObjectId → **str**. There is **no** `store` or `prefs` object.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Return settings. If missing, insert defaults and return. |
| `PUT` | `/api/settings` | Full replace of validated body. **Keeps the same `_id`.** |
| `PATCH` | `/api/settings` | Deep-merge partial updates for `business_name` / `brand` / `kiosk` / `ticket` / `whatsapp`. |

## Settings JSON (`SettingsPublic`)

```json
{
  "id": "507f1f77bcf86cd799439060",
  "business_name": "Tiendita",
  "brand": {
    "primary_color": "#ff8a7a",
    "secondary_color": "#c9b1ff",
    "accent_color": "#ffe66d"
  },
  "kiosk": {
    "welcome_text": "¡Bienvenido! Escoge tus productos",
    "logo_url": null
  },
  "ticket": {
    "footer": "¡Gracias por su compra!",
    "show_sku": true,
    "show_change": true
  },
  "whatsapp": {
    "enabled": false,
    "default_country_code": "52",
    "message_template": "Hola, aquí está tu ticket de {business_name}. Total: {total}"
  },
  "updated_at": "2026-09-14T19:00:00Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | PyObjectId → str |
| `business_name` | string | required, non-empty (stripped) on PUT; if sent on PATCH must be non-empty |
| `brand.primary_color` / `secondary_color` / `accent_color` | string | `#RRGGBB` (hex) |
| `kiosk.welcome_text` | string \| null | |
| `kiosk.logo_url` | string \| null | URL only — never Base64 |
| `ticket.footer` | string \| null | |
| `ticket.show_sku` / `show_change` | bool | |
| `whatsapp.enabled` | bool | |
| `whatsapp.default_country_code` | string | digits only (e.g. `"52"`) |
| `whatsapp.message_template` | string | placeholders `{business_name}`, `{total}` |
| `updated_at` | datetime | UTC |

## Defaults (inserted on first GET)

- `business_name`: `"Tiendita"`
- `brand`: `primary_color="#ff8a7a"`, `secondary_color="#c9b1ff"`, `accent_color="#ffe66d"`
- `kiosk.welcome_text`: `"¡Bienvenido! Escoge tus productos"`, `logo_url`: `null`
- `ticket.footer`: `"¡Gracias por su compra!"`, `show_sku`/`show_change`: `true`
- `whatsapp.enabled`: `false`, `default_country_code`: `"52"`, template with `{business_name}` / `{total}`

## PUT vs PATCH

- **PUT** — full body required (`business_name`, `brand`, `kiosk`, `ticket`, `whatsapp`). Same `_id`.
- **PATCH** — any subset; nested objects are **deep-merged** (e.g. `{"brand":{"primary_color":"#ff8a7a"}}` keeps secondary/accent). Merged result is re-validated.

## Errors

| Code | When |
|------|------|
| `401` | missing/invalid JWT |
| `422` | empty `business_name`, color not `#RRGGBB`, non-digit country code, missing PUT fields |

## Curl examples

```bash
TOKEN=$(curl -sf -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -sf http://127.0.0.1:8000/api/settings -H "Authorization: Bearer $TOKEN"

curl -sf -X PATCH http://127.0.0.1:8000/api/settings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"business_name":"Mi Tienda","brand":{"primary_color":"#ff8a7a"}}'

curl -sf -X PUT http://127.0.0.1:8000/api/settings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"business_name":"Mi Tienda","brand":{"primary_color":"#ff8a7a","secondary_color":"#c9b1ff","accent_color":"#ffe66d"},"kiosk":{"welcome_text":"¡Hola!","logo_url":null},"ticket":{"footer":"¡Gracias!","show_sku":true,"show_change":true},"whatsapp":{"enabled":false,"default_country_code":"52","message_template":"Hola, aquí está tu ticket de {business_name}. Total: {total}"}}'
```

---

# Dashboard (F7 / JUA-13)

Timezone: **America/Mexico_City** (calendar days → UTC windows on `sales.created_at`).

## `GET /api/dashboard/summary`

Auth: JWT.

Query:
- `from`, `to` — `YYYY-MM-DD` CDMX days, inclusive. Defaults: `from` = 1st day of CDMX month of `to`; `to` = today CDMX.
- `threshold` — low-stock threshold (default `5`).

### Response (canon only — no aliases)

```json
{
  "from": "2026-09-01",
  "to": "2026-09-15",
  "timezone": "America/Mexico_City",
  "sales": {
    "today": { "count": 0, "gross_total": 0, "amount_paid_total": 0, "amount_due_total": 0 },
    "month": { "count": 0, "gross_total": 0, "amount_paid_total": 0, "amount_due_total": 0 },
    "range": { "count": 0, "gross_total": 0, "amount_paid_total": 0, "amount_due_total": 0 }
  },
  "payment_methods": [
    { "method": "cash", "count": 0, "gross_total": 0, "amount_paid_total": 0 },
    { "method": "card", "count": 0, "gross_total": 0, "amount_paid_total": 0 }
  ],
  "products": {
    "top": [{ "product_id": "...", "name": "...", "sku": "...", "qty_sold": 0, "revenue": 0 }],
    "least": [{ "product_id": "...", "name": "...", "sku": "...", "qty_sold": 0, "revenue": 0 }]
  },
  "series": [{ "date": "2026-09-01", "count": 0, "gross_total": 0 }],
  "cxc": { "open_count": 0, "open_balance": 0 },
  "inventory": {
    "low_stock_count": 0,
    "low_stock_threshold": 5,
    "items": [{ "id": "...", "name": "...", "sku": "...", "stock": 0, "unit": "pza" }]
  }
}
```

Notes:
- `sales.today` = CDMX today; `sales.month` = CDMX month of `to`; `sales.range` / `payment_methods` / `products` / `series` use `from`–`to`.
- `series` fills missing days with zeros.
- `products.top|least` limit 10; rank by `qty_sold` then `revenue`; only products with sales in range.
- `cxc` snapshot: partial sales count + Σ `customer.balance`.
- `inventory` snapshot: active products with `stock <= threshold` (max 50, stock ASC).

**Forbidden aliases:** `sales_by_day`, `by_payment_method`, `top_sold`, `least_sold`, `qty`/`gross` product fields.

---

# Historial (F8 / JUA-16)

Timezone: **America/Mexico_City** — `from` / `to` are CDMX calendar days (inclusive), converted to UTC windows on `sales.created_at` (same pattern as Dashboard F7).

Auth: JWT (`get_current_user`).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sales` | List sales with Historial filters (extends F5 board list). Newest first. |
| `GET` | `/api/sales/{id}` | One `SalePublic` by id, or `404`. Path must not capture `receivables` (static route registered first). |

## `GET /api/sales` query

| Param | Notes |
|-------|-------|
| `from` | `YYYY-MM-DD` CDMX day → UTC start of that day on `created_at` |
| `to` | `YYYY-MM-DD` CDMX day → UTC end of that day on `created_at` |
| `payment_status` | `paid|partial` |
| `payment_method` | `cash|card` |
| `customer_id` | ObjectId string |
| `delivery_status` | `pending|assigned|out|delivered|cancelled` (F5) |
| `delivery_driver_id` | ObjectId string (F5) |
| `with_delivery` | `true` → only sales with delivery fields set (F5) |
| `limit` | default `100`, max `500` |
| `skip` | default `0` |

- If both `from` and `to` are set, `to` must be `>= from` (else `422`).
- If only `from` / only `to`, filter with `$gte` start or `$lte` end respectively.
- Invalid enum / id format → `400`. Invalid date format → `422`.

Response: `SalePublic[]`.

## `GET /api/sales/{id}`

Returns one `SalePublic`. Unknown / invalid id → `404` (`Venta no encontrada`).

## Curl examples

```bash
TOKEN=$(curl -sf -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Historial list — CDMX day range + payment filters
curl -sf "http://127.0.0.1:8000/api/sales?from=2026-09-01&to=2026-09-15&payment_method=cash&payment_status=paid&limit=50&skip=0" \
  -H "Authorization: Bearer $TOKEN"

# Single ticket
curl -sf "http://127.0.0.1:8000/api/sales/SALE_ID" -H "Authorization: Bearer $TOKEN"

# receivables still works (not captured by {id})
curl -sf "http://127.0.0.1:8000/api/sales/receivables" -H "Authorization: Bearer $TOKEN"
```

---

# Despacho (F10 / JUA-20)

Kitchen/counter **dispatch tickets** — separate from Entregas (`/api/deliveries` = repartidores CRUD). Collection: `dispatch_tickets`.

Auth: JWT. Endpoints gated by **`require_despacho_access`** → roles **`admin|despacho`** only (`cajero` → **403**). Rol `despacho` is otherwise limited to auth `/me` + `/logout` (see RBAC).

## Endpoints (`/api/despacho`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/despacho` | List tickets. Optional `?status=pending\|ready`. Newest first. |
| `GET` | `/api/despacho/{id}` | One ticket by id |
| `PATCH` | `/api/despacho/{id}` | Body `{ "status": "pending"\|"ready" }` |

## Ticket JSON

```json
{
  "id": "507f1f77bcf86cd799439070",
  "folio": "D-42",
  "sale_id": "507f1f77bcf86cd799439071",
  "origin": "caja",
  "status": "pending",
  "lines": [{ "product_id": "...", "name": "Coca 600ml", "qty": 2 }],
  "created_at": "2026-09-15T22:00:00Z",
  "updated_at": "2026-09-15T22:00:00Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | PyObjectId → str |
| `folio` | string | Human-readable `D-{n}` from Mongo counter `counters._id=dispatch_folio` |
| `sale_id` | string | One ticket per sale (unique index) |
| `origin` | string | `caja` \| `kiosko` |
| `status` | string | `pending` \| `ready` |
| `lines` | array | Snapshots: `product_id`, `name`, `qty` |
| `created_at` / `updated_at` | datetime | UTC |

## Paid-sale hook

When a **paid** sale is created inside `create_sale_atomic`:

- `POST /api/sales` → ticket `origin=caja`
- Kiosk fulfill → ticket `origin=kiosko` when resulting sale is paid
- Line snapshots use product name from lookup at sale time
- **No** ticket for `payment_status=partial` (crédito) in v1
- Idempotent: unique `sale_id` (duplicate insert ignored)

## Indexes

- `dispatch_tickets.sale_id` (**unique**)
- `dispatch_tickets.status`

## Errors

| Code | When |
|------|------|
| `401` | missing/invalid JWT |
| `403` | role not admin\|despacho |
| `400` | invalid `status` filter / body |
| `404` | unknown ticket id |
| `422` | Pydantic validation |

## Curl examples

```bash
# Prefer cookie jar after login; Bearer shown for scripts that still have a token
curl -sf 'http://127.0.0.1:8000/api/despacho?status=pending' -H "Authorization: Bearer $TOKEN"
curl -sf -X PATCH "http://127.0.0.1:8000/api/despacho/TICKET_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"ready"}'
```

**Do not** confuse with `GET/PATCH /api/deliveries` (F5 repartidores).

**Sale response folio (nit):** paid `POST /api/sales` and kiosk fulfill return `SalePublic.folio` equal to the dispatch ticket folio (`D-*`). Partial sales: `folio` null.
