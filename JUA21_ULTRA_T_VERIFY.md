# JUA-21 Ultra-T folio verify — POS Tienditas

| Field | Value |
|-------|-------|
| **Verdict** | **PASS** (all 3 cases) |
| **Ran at** | 2026-09-15 16:25 CT (2026-09-15T22:25:21Z) |
| **Repo tip under test** | `a26bb3d` — *F10 nit: echo dispatch folio on paid sale response* |
| **Base URL** | `http://127.0.0.1:8000` |
| **Auth** | HttpOnly cookie jars (`-c`/`-b`); seed admin `admin@tienditas.com` / `Admin123!` |
| **Services** | Mongo `:27017` healthy; MinIO `:9000` healthy; uvicorn `--reload` **restarted** for tip |
| **Product used** | Coca-Cola 600ml `6aa81f7058622a2ec2ee3212` @ 18.5 |
| **Cajero** | `cajero.jua21.1789511120@tienditas.com` (registered via admin) |

Contract nit: paid `POST /api/sales` and kiosk fulfill return `SalePublic.folio` equal to dispatch ticket folio (`D-*`). Partial sales: `folio` null.

---

## Case 1 — POST /api/sales fully paid → folio == despacho `D-*` — **PASS**

### Steps

1. As **cajero**, `POST /api/sales` paid (Coca-Cola ×1, cash, amount_paid > total).
2. Assert response `folio` matches `D-*`.
3. As **admin**, `GET /api/despacho?status=pending` → ticket for that `sale_id` with same folio, `origin=caja`.

### Evidence

```text
POST /api/sales → 201
{
  "id": "6aa9c5d17f7383bf7622c018",
  "payment_status": "paid",
  "total": 18.5,
  "amount_paid": 23.5,
  "folio": "D-3",
  "change": 5.0
}

GET /api/despacho?status=pending → ticket for sale_id:
{
  "id": "6aa9c5d17f7383bf7622c019",
  "folio": "D-3",
  "sale_id": "6aa9c5d17f7383bf7622c018",
  "origin": "caja",
  "status": "pending"
}
```

Asserts: `sale.folio == ticket.folio == "D-3"`; `origin=caja`.

**Case 1: PASS**

---

## Case 2 — Kiosk fulfill (paid) → folio == despacho `D-*` origin kiosko — **PASS**

### Steps

1. Public `POST /api/kiosk/orders` (pending).
2. As **cajero**, `POST /api/kiosk/orders/{id}/fulfill` paid.
3. Assert fulfill `sale.folio` is `D-*`.
4. As **admin**, pending despacho → ticket `origin=kiosko`, same folio.

### Evidence

```text
POST /api/kiosk/orders → 201 id=6aa9c5d17f7383bf7622c01a status=pending total=18.5

POST .../fulfill → 200
{
  "order": {
    "id": "6aa9c5d17f7383bf7622c01a",
    "status": "fulfilled",
    "sale_id": "6aa9c5d17f7383bf7622c01b"
  },
  "sale": {
    "id": "6aa9c5d17f7383bf7622c01b",
    "payment_status": "paid",
    "total": 18.5,
    "folio": "D-4"
  }
}

GET /api/despacho?status=pending → ticket:
{
  "id": "6aa9c5d17f7383bf7622c01c",
  "folio": "D-4",
  "sale_id": "6aa9c5d17f7383bf7622c01b",
  "origin": "kiosko",
  "status": "pending"
}
```

Asserts: `sale.folio == ticket.folio == "D-4"`; `origin=kiosko`.

**Case 2: PASS**

---

## Case 3 — Partial crédito → folio null (no D-* ticket) — **PASS**

### Steps

1. As **cajero**, `POST /api/sales` with `customer_id`, `amount_paid` < total → `payment_status=partial`.
2. Assert response `folio` is `null`.
3. Confirm no despacho ticket for that `sale_id`.

### Evidence

```text
POST /api/sales → 201
{
  "id": "6aa9c5d17f7383bf7622c01d",
  "payment_status": "partial",
  "total": 18.5,
  "amount_paid": 9.25,
  "amount_due": 9.25,
  "customer_id": "6aa82634b64c5cdd997e8b6e",
  "folio": null
}

GET /api/despacho?status=pending → 0 tickets for sale_id 6aa9c5d17f7383bf7622c01d
```

Asserts: `folio is null`; no dispatch ticket created for partial sale.

**Case 3: PASS**

---

## Summary

| Case | Description | Result |
|------|-------------|--------|
| 1 | Paid `POST /api/sales` folio echoes despacho `D-*` (caja) | **PASS** |
| 2 | Kiosk fulfill paid folio echoes despacho `D-*` (kiosko) | **PASS** |
| 3 | Partial credit sale `folio` null / no ticket | **PASS** |

No product code changes. Report-only commit.
