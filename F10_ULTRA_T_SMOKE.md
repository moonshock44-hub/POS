# F10 / JUA-20 Despacho — Ultra-T smoke report

| Field | Value |
|-------|-------|
| **Result** | **PASS** (cases 1–3 + UI light) |
| **Ran at** | 2026-09-15 16:20 CT (2026-09-15T22:20:52Z) |
| **Repo tip under test** | `0ea15fc` — F10: /api/despacho + paid-sale dispatch hook |
| **History** | auth `16f2887`, UI `e779c1f`, base `900f8bb` |
| **Base URL** | `http://127.0.0.1:8000` |
| **Auth mode** | HttpOnly cookie jars (`-c`/`-b`); no localStorage JWT |
| **Services** | Mongo `:27017` healthy; MinIO `:9000` healthy; uvicorn **restarted** then reloaded tip |

OpenAPI paths present: `/api/despacho`, `/api/despacho/{ticket_id}`.

---

## Bring-up

- Reused running mongod + minio.
- Killed prior uvicorn `:8000`, restarted:
  `uvicorn server:app --reload --host 0.0.0.0 --port 8000`
- Startup log: MongoDB OK, seed listo, COOKIE_SECURE=false.
- Seed admin from `.env`: `admin@tienditas.com` / `Admin123!`
- Registered via admin cookie:
  - cajero `cajero.f10.1789510815@tienditas.com` / `Cajero123!` → **201**
  - despacho `despacho.f10.1789510815@tienditas.com` / `Despacho123!` → **201**
- Login responses: JSON `{ token_type, user }` (**no** `access_token` body); `Set-Cookie: access_token=…; HttpOnly; SameSite=lax`

---

## Case 1 — Caja path — **PASS**

**Steps**

1. As **cajero**, `POST /api/sales` paid sale (Coca-Cola 600ml ×1, cash).
2. As **admin**, `GET /api/despacho?status=pending` → ticket for that `sale_id`.
3. As **admin**, `GET /api/despacho/{id}`.
4. As **despacho**, `PATCH /api/despacho/{id}` `{"status":"ready"}`.
5. Filters: ticket in `?status=ready`, absent from `?status=pending` after patch.

**Evidence**

```text
POST /api/sales → 201
sale id=6aa9c4ad2f130a1e7a7ba741 payment_status=paid total=18.5

GET /api/despacho?status=pending → 200
{
  "id": "6aa9c4ad2f130a1e7a7ba742",
  "folio": "D-1",
  "sale_id": "6aa9c4ad2f130a1e7a7ba741",
  "origin": "caja",
  "status": "pending",
  "lines": [{"product_id":"6aa81f7058622a2ec2ee3212","name":"Coca-Cola 600ml","qty":1.0}],
  "created_at": "2026-09-15T22:20:29.674000",
  "updated_at": "2026-09-15T22:20:29.674000"
}

GET /api/despacho/6aa9c4ad2f130a1e7a7ba742 → 200 (same)

PATCH /api/despacho/6aa9c4ad2f130a1e7a7ba742 {"status":"ready"} → 200
→ status=ready, updated_at advanced

GET ?status=ready → contains ticket; GET ?status=pending after → does not
```

Asserts: `origin=caja`, `status=pending` then `ready`, `folio=D-1` set, lines present. Ticket is **not** Entregas (`/api/deliveries` unchanged by this path).

---

## Case 2 — Kiosko path — **PASS**

**Steps**

1. Public `POST /api/kiosk/orders` (pending).
2. As **cajero**, `POST /api/kiosk/orders/{id}/fulfill` paid.
3. As **admin**, pending list → ticket `origin=kiosko`.
4. As **despacho**, `PATCH` → `ready`.

**Evidence**

```text
POST /api/kiosk/orders → 201 id=6aa9c4b42f130a1e7a7ba743 status=pending total=18.5

POST /api/kiosk/orders/.../fulfill → 200
  order.status=fulfilled sale_id=6aa9c4b52f130a1e7a7ba744
  sale.payment_status=paid

GET /api/despacho?status=pending → 200
{
  "id": "6aa9c4b52f130a1e7a7ba745",
  "folio": "D-2",
  "sale_id": "6aa9c4b52f130a1e7a7ba744",
  "origin": "kiosko",
  "status": "pending",
  "lines": [{"product_id":"6aa81f7058622a2ec2ee3212","name":"Coca-Cola 600ml","qty":1.0}],
  ...
}

PATCH → 200 status=ready folio=D-2
```

---

## Case 3 — RBAC — **PASS**

| Actor | Call | HTTP | Detail / note |
|-------|------|------|----------------|
| cajero cookie | `GET /api/despacho` | **403** | `Se requiere rol despacho o admin` |
| cajero | `GET /api/despacho?status=pending` | **403** | same |
| cajero | `PATCH /api/despacho/{id}` | **403** | same |
| admin | `GET /api/despacho?status=ready` | **200** | OK |
| despacho | `GET /api/despacho?status=ready` | **200** | OK |
| despacho | `PATCH /api/despacho/{id}` | **200** | OK |
| despacho | `GET /api/products` | **403** | `Rol despacho no tiene acceso a este recurso` |
| despacho | `GET /api/sales` | **403** | same |
| despacho | `GET /api/settings` | **403** | same |
| despacho | `GET /api/auth/me` | **200** | allowed |

Contract: `require_despacho_access` = admin\|despacho; cajero 403; despacho confined off staff/admin non-kanban APIs.

---

## Optional — UI `/despacho` — **PASS** (light)

- Route guard + `path="/despacho"` in `app/frontend/src/App.jsx`.
- Page: `app/frontend/src/pages/Dispatch.jsx`.
- Vite `http://127.0.0.1:5173/despacho` → **200** (SPA shell).
- API evidence above is primary.

---

## Curl cookbook (cookie jars)

```bash
BASE=http://127.0.0.1:8000
curl -s -c admin.jar -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}'
# register/login cajero + despacho similarly → cajero.jar / despacho.jar

curl -s -b cajero.jar -X POST $BASE/api/sales -H 'Content-Type: application/json' \
  -d '{"lines":[{"product_id":"PRODUCT_ID","qty":1,"price":18.5}],"payment_method":"cash","amount_paid":25}'

curl -s -b admin.jar "$BASE/api/despacho?status=pending"
curl -s -b despacho.jar -X PATCH "$BASE/api/despacho/TICKET_ID" \
  -H 'Content-Type: application/json' -d '{"status":"ready"}'

curl -s -b cajero.jar "$BASE/api/despacho"   # expect 403
```

---

## Bugs / handoffs

- **None blocking.** All required smoke cases passed against tip `0ea15fc`.
- Observation (non-fail): sale JSON `folio` field is `null` on caja sale response; dispatch ticket `folio` (`D-n`) is set as contracted. Not a despacho failure.
- Product code **not** modified; report-only commit.

---

## Verdict

| Case | Result |
|------|--------|
| 1 Caja paid → ticket pending → PATCH ready + filters | **PASS** |
| 2 Kiosko fulfill → ticket kiosko pending → ready | **PASS** |
| 3 RBAC cajero 403 / admin+despacho OK / despacho denied elsewhere | **PASS** |
| UI `/despacho` exists (light) | **PASS** |

**OVERALL: PASS**
