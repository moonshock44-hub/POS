# F9 / JUA-14 Ultra-T Pulido/QA Report (POS Tienditas)

**Agent:** Ultra-T executor (report → Ultra-T parent → Odysseo)  
**When:** 2026-09-15 (America/Mexico_City)  
**Base used:** `b529d63` (includes `c6fe3b5` auth harden + `48e0b71` Shuri a11y). Earlier brief cited `bf7e377` / `48e0b71`; tip moved during run.  
**HEAD after Ultra-T:** `40d33d2`

## Dirty WIP observed (did not block final pass)

At start, `master` @ `bf7e377` had teammate WIP (auth/kiosk/settings/server + Layout/UI + `ProductImage.jsx`). Mid-run that WIP landed as:

- `c6fe3b5` — Cortana: harden auth cookies/JWT/roles + kiosk catalog  
- `48e0b71` — Shuri: a11y + polish  
- `b529d63` — CONTRACT register admin-only + public kiosk products  

Ultra-T did **not** reopen auth or UI. Brief accidental stash of teammate WIP was restored; obsolete stash dropped after those commits existed. Final tree clean before Ultra-T commit.

## Verify scripts (F0–F8)

| Script | Result | Notes |
|--------|--------|-------|
| `verify_fase0.sh` | **PASS** (after fix) | Was failing vs live HEAD: register is admin-only |
| `verify_fase1_products.sh` | PASS | |
| `verify_fase2_sales.sh` | PASS | |
| `verify_fase3_customers.sh` | PASS | |
| `verify_fase5_deliveries.sh` | PASS | |
| `verify_fase6_settings.sh` | **PASS** (after fix) | Failed on dirty singleton (`business_name`/`brand`/`show_sku` mutated by prior runs) |
| `verify_fase8_historial.sh` | PASS | |
| F4 / F7 dedicated scripts | N/A | Covered in E2E API path below |

### Failures + repro (pre-fix)

**F0 (pre-fix, after uvicorn loaded `c6fe3b5`):**
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"bare@test.com","password":"Cajero123!","name":"Bare","role":"cajero"}'
# → 401 No autenticado
# scripts/verify_fase0.sh register step had no Authorization header → curl -sf fail
```

**Ops note:** uvicorn on `:8000` was initially started **without** `--reload` and kept serving pre-harden auth (public register still 201). After process restart → 401 as contracted. Prefer `--reload` or restart after pull.

**F6 (pre-fix):**
```bash
bash scripts/verify_fase6_settings.sh
# AssertionError on business_name == "Tiendita" when DB had "Tienda PUT" / altered brand/ticket
```

## E2E path (API, not only verify scripts)

Path exercised: **login → inventario → POS → crédito → kiosko → entregas → settings → dashboard → historial** (24 steps, all OK).

Highlights:

- Paid sale + change OK  
- Partial requires `customer_id` → **400** without; balance += `amount_due`; abono FIFO → `balance_after` 0  
- Public `GET /api/kiosk/products` **200**, items **omit `cost`**  
- Kiosk create → pending count → fulfill **200**  
- Delivery PATCH assign OK  
- Settings GET/PATCH OK  
- Dashboard summary has `cxc` + period `amount_due_total`  
- Historial list + `GET /api/sales/{id}` + 404 unknown  

## F7 CxC verdict: **CONTRACT (not a live atomicity bug)**

### Citations

- CONTRACT **L195**: partial requires `customer_id`; increments `customer.balance` by `amount_due` atomically with sale create.  
- CONTRACT **L335 / L370**: payments decrement balance + FIFO on partial sales; compensating rollback on failure.  
- CONTRACT **L812–814**: period blocks expose `amount_due_total` (sales-in-range aggregates).  
- CONTRACT **L825 / L838**: `cxc` snapshot = **partial sales count** + **Σ `customer.balance`** (not Σ `sale.amount_due`).

### Evidence (Mongo, ObjectId-correct)

```
true_drifts []                          # per-customer balance == Σ amount_due of their partials
Σ customer.balance     == Σ amount_due (partials with customer_id)   # matched (e.g. 69.0 == 69.0)
orphan partials        customer_id=null  n=2  sum_due=38.5           # legacy pre-F3 rows (2026-09-14)
Σ amount_due (all partial) = linked + orphan   # e.g. 107.5 = 69 + 38.5
dashboard cxc.open_count includes orphans; open_balance does NOT (by design uses Σ balance)
```

Dashboard `_cxc`: `open_count = count(payment_status=partial)`, `open_balance = Σ customer.balance` — matches L838.

**Conclusion:** Comparing Σ `sale.amount_due` (all partial) vs Σ `customer.balance` is comparing **different metrics** + optional **legacy orphan rows**. Linked customers show **no FIFO/atomicity drift**. Period `amount_due_total` is intentionally sales-in-range, not all CxC.

**No code fix** for F7 metrics. Optional data hygiene (out of Ultra-T minimal scope): reclassify/cancel 2 orphan partials (`6aa824a640016f751bed509c`, `6aa824b140016f751bed509f`) or attach customers — handoff note only.

## Bugs found

| Sev | Item | Fix / handoff |
|-----|------|----------------|
| P1 | `verify_fase0` out of sync with admin-only register (`c6fe3b5` / CONTRACT) | **Fixed** in `40d33d2` |
| P1 | `verify_fase6` non-idempotent on dirty settings singleton | **Fixed** in `40d33d2` |
| P2 | Stale uvicorn without reload → false confidence on auth until restart | Ops note; not a code bug |
| P2 | Legacy partial sales with `customer_id: null` inflate `open_count` / Σ due | Data hygiene handoff (Sombra optional); create path correctly rejects |
| — | F7 Σ amount_due vs Σ balance | **Not a bug** — contract metrics |

No additional functional P0 found in E2E/barrido after reload.

## Fixes landed

| Hash | One-liner |
|------|-----------|
| `40d33d2` | F9: smoke scripts match admin-only register + idempotent settings |

## Remaining handoffs

| Owner | Item |
|-------|------|
| **Cortana** | Auth already on master (`c6fe3b5`); Ultra-T did not touch. Keep verify_fase0 aligned if register rules change again. |
| **Shuri** | UI/a11y (`48e0b71`) — Ultra-T did not duplicate nav/images polish. |
| **Sombra** | Optional: migrate/clean 2 orphan partial sales without `customer_id`; confirm backend ownership if any dashboard UX should show “unlinked CxC”. |
| **Ops** | Run API with `--reload` or restart after pulls so smoke hits committed auth. |

## HEAD before / after

- Brief start / expected: ~`bf7e377` then `c6fe3b5` / `48e0b71` / `b529d63`  
- Ultra-T work base: **`b529d63`**  
- After Ultra-T commit: **`40d33d2`**
