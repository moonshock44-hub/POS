# JUA-17 Ultra-T deep-security verify — POS Tienditas

| Field | Value |
|-------|-------|
| Date | 2026-09-15 ~11:30 America/Mexico_City (UTC-6) |
| Tip HEAD | `0b44831` — *JUA-17: CONTRACT session HttpOnly, RBAC, rate-limits* (docs-only on top of BE) |
| BE commit verified | `20b5da9` — *JUA-17: HttpOnly cookie session, RBAC cajero, rate-limit, secrets/TTL* (ancestor of tip) |
| FE commit in history | `7eb8df0` — *JUA-19: cookie-only auth (no localStorage JWT)* (ancestor of tip) |
| API base | `http://127.0.0.1:8000` (uvicorn `--reload` restarted for this run) |
| Stack | FastAPI + Mongo (`pos-tienditas-mongo`) + MinIO healthy; FE code-check only |
| Verdict | **PASS** (all four cases) |

Cookie name: **`access_token`** (HttpOnly). Seed admin: `admin@tienditas.com` / `Admin123!` (from `.env`).

---

## Case 1 — Cookie-only login — **PASS**

### Commands

```bash
curl -sS -D /tmp/jua17-verify/c1-login.hdr -o /tmp/jua17-verify/c1-login.json \
  -c /tmp/jua17-verify/admin.jar \
  -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}'

curl -sS -D /tmp/jua17-verify/c1-me.hdr -o /tmp/jua17-verify/c1-me.json \
  -b /tmp/jua17-verify/admin.jar \
  http://127.0.0.1:8000/api/auth/me
```

### Evidence

| Check | Result |
|-------|--------|
| HTTP login | `200 OK` |
| Body keys | `token_type`, `user` only — **no `access_token`** |
| JWT in JSON | **absent** (no `eyJ…` pattern in body) |
| `Set-Cookie` | `access_token=…; HttpOnly; Max-Age=43200; Path=/; SameSite=lax` |
| GET `/api/auth/me` cookie-only (no Bearer) | `200` — `email=admin@tienditas.com`, `role=admin` |

Login body snippet:

```json
{"token_type":"bearer","user":{"id":"6aa81b08b1965795b89c26a8","email":"admin@tienditas.com","name":"Administrador","role":"admin","is_active":true,"created_at":"2026-09-14T16:04:24.252000"}}
```

### FE contract (code @ `7eb8df0`+)

- `rg localStorage app/frontend` → **no matches**
- `AuthContext.jsx`: restores session via `/me`; comments say ignore `access_token` if present
- `lib/api.js`: `credentials: 'include'` only

**1a / 1b / 1c: PASS**

---

## Case 2 — Cajero RBAC — **PASS**

### Setup

Admin registered cajero `cajero.jua17.ultra@tienditas.com` / `Cajero123!` → `201 Created` (body `{token_type,user}` only; admin cookie preserved). Cajero login → HttpOnly cookie jar.

### Denied (expect 403)

| Action | Status | Detail |
|--------|--------|--------|
| `POST /api/products` | **403** | `Se requiere rol admin` |
| `PUT /api/settings` | **403** | `Se requiere rol admin` |
| `PATCH /api/settings` | **403** | `Se requiere rol admin` |
| `POST /api/auth/register` | **403** | `Se requiere rol admin` |
| `POST /api/products/upload` | **403** | `Se requiere rol admin` |

### Allowed

| Action | Status | Notes |
|--------|--------|-------|
| `GET /api/products` | **200** | 33 items; **`cost` key omitted** (sample keys: id, name, sku, price, stock, … — no `cost`) |
| `GET /api/customers` | **200** | OK |
| `GET /api/sales` | **200** | OK |
| `GET /api/settings` | **200** | read OK |
| `POST /api/sales` (cookie) | **201** | cajero sale write allowed |

Product sample for cajero (cost absent):

```text
sample_keys=['active','category','created_at','id','image_url','name','price','sku','stock','unit','updated_at']
has_cost_key=False
```

**Case 2: PASS**

---

## Case 3 — Rate-limit login → 429 — **PASS**

Env: `RATE_LIMIT_LOGIN_PER_MIN=5`. Burst used distinct `X-Forwarded-For: 203.0.113.77` (limiter keys on XFF) so other cases stay unpoisoned.

```bash
for i in $(seq 1 12); do
  curl -sS -D - -o /tmp/body.json -X POST http://127.0.0.1:8000/api/auth/login \
    -H 'Content-Type: application/json' \
    -H 'X-Forwarded-For: 203.0.113.77' \
    -d '{"email":"admin@tienditas.com","password":"WrongPassword!!!"}'
done
```

| Attempt | Status |
|---------|--------|
| 1–5 | `401` (bad password) |
| **6** | **`429`** |

429 body:

```json
{"detail":"Demasiados intentos. Intenta de nuevo más tarde."}
```

**Retry-After header:** **none** (not implemented in `utils/rate_limit.py`).

**Case 3: PASS** (429 at attempt 6 = after 5 allowed hits)

---

## Case 4 — Admin OK — **PASS**

| Action | Status | Notes |
|--------|--------|-------|
| `POST /api/auth/register` (cajero) | **201** | `cajero.jua17.adminok@tienditas.com` |
| `PATCH /api/settings` `{}` | **200** | not 403 |
| `POST /api/products` (with category/unit) | **201** | includes `cost: 4.0` |
| `PUT /api/products/{id}` | **200** | mutate OK |
| `DELETE /api/products/{id}` | **200** | soft-delete (`active:false`) |
| `GET /api/products` as admin | **200** | all 33 items **include `cost`** |
| `POST /api/sales` | **201** | smoke OK |

First product POST without `category`/`unit` returned **422** (schema) — not RBAC; retest with required fields → **201**.

**Case 4: PASS**

---

## Bugs / observations / handoffs

| Severity | Item | Owner hint |
|----------|------|------------|
| Low / nicety | Login/register JSON still returns `"token_type":"bearer"` with no token. Harmless; could omit when cookie-only. | Cortana (BE polish) optional |
| Low / docs | `Retry-After` not set on 429 (CONTRACT does not require it; useful for clients). | Cortana optional |
| Docs drift | Root `README.md` still says JWT cookie + Bearer in `localStorage` — **stale vs CONTRACT/JUA-17**. Tip `0b44831` updated CONTRACT only. | Sombra / docs |
| Info | Startup logs: `JWT_SECRET is weak/default` + `COOKIE_SECURE=false` (expected local). | ops |
| Info | In-memory rate limit is per-process; fine for single uvicorn worker. | — |

No product-code changes made. Verify artifacts under `/tmp/jua17-verify/` (not committed).

---

## Summary table

| Case | Result |
|------|--------|
| 1 Cookie-only login + FE no localStorage | **PASS** |
| 2 Cajero RBAC (403 mutate/settings/register/upload; GET products no cost; sales/customers OK) | **PASS** |
| 3 Login rate-limit 429 (attempt 6; limit 5/min) | **PASS** |
| 4 Admin register / settings / product mutate / sales | **PASS** |

**Overall: PASS**
