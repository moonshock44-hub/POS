# POS Tienditas

Stack local: React (Vite) + FastAPI + MongoDB + MinIO. Auth = cookie **HttpOnly** (SPA); Bearer solo para scripts/smoke. Ver [`CONTRACT.md`](./CONTRACT.md) (JUA-17).

Fases entregadas: **F0–F9** + seguridad profunda **JUA-17**. Contrato API: [`CONTRACT.md`](./CONTRACT.md).

## Requisitos

- Docker / Docker Compose (Mongo + MinIO)
- Python 3.11+ (venv)
- Node.js 20+

## Arranque

```bash
# 1) MongoDB + MinIO
cd /workspace/pos-tienditas/app
docker compose up -d

# 2) Backend
cd /workspace/pos-tienditas/app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # si aún no existe
uvicorn server:app --reload --host 0.0.0.0 --port 8000

# 3) Frontend
cd /workspace/pos-tienditas/app/frontend
npm install
cp .env.example .env
npm run dev
```

- API: http://127.0.0.1:8000/api/health
- UI: http://127.0.0.1:5173
- MinIO API: http://127.0.0.1:9000
- MinIO Console: http://127.0.0.1:9001 (`minioadmin` / `minioadmin`)

> `docker-compose` usa `quay.io/minio/minio` (Docker Hub a veces bloquea el pull).

## Credenciales seed (admin)

| Campo | Valor |
|-------|--------|
| Email | `admin@tienditas.com` |
| Password | `Admin123!` |
| Rol | `admin` |

Roles: `admin` | `cajero` | `despacho`.

## Object storage (imágenes)

Mongo solo guarda `image_url` (nunca Base64). Vars en `app/backend/.env` — ver `.env.example` (`S3_*`).

## API por fase (resumen)

| Fase | Qué | Endpoints clave |
|------|-----|-----------------|
| F0 | Auth | `/api/auth/*`, `/api/health` |
| F1 | Inventario | `/api/products`, `/api/products/upload` |
| F2 | Ventas | `POST /api/sales` (stock atómico + pago) |
| F3 | Clientes/CxC | `/api/customers`, abonos, `/api/sales/receivables` |
| F4 | Kiosko | `POST /api/kiosk/orders` (público), pending/count, fulfill (JWT) |
| F5 | Repartidores | `/api/deliveries` + `PATCH /api/sales/{id}/delivery` |
| F6 | Settings | `GET/PUT/PATCH /api/settings` |
| F7 | Dashboard | `GET /api/dashboard/summary` (TZ CDMX) |
| F8 | Historial | `GET /api/sales` filtros + `GET /api/sales/{id}` |

Detalle y shapes: **`CONTRACT.md`**.

## Smoke / verify

```bash
bash /workspace/pos-tienditas/scripts/verify_fase0.sh
bash /workspace/pos-tienditas/scripts/verify_fase1_products.sh
bash /workspace/pos-tienditas/scripts/verify_fase2_sales.sh
bash /workspace/pos-tienditas/scripts/verify_fase3_customers.sh
bash /workspace/pos-tienditas/scripts/verify_fase5_deliveries.sh
bash /workspace/pos-tienditas/scripts/verify_fase6_settings.sh
bash /workspace/pos-tienditas/scripts/verify_fase8_historial.sh

# Seeds opcionales
python3 /workspace/pos-tienditas/scripts/seed_products.py
python3 /workspace/pos-tienditas/scripts/seed_customers.py
```

Notas:
- No hay `verify_fase4` / `verify_fase7` dedicados aún (smoke E2E lo corre Odysseo en el tablero).
- Fechas de historial/dashboard usan calendario **America/Mexico_City**.

## F9 / JUA-17 (seguridad)

Pulido/QA F9 cerrado. Sesión web = cookie HttpOnly only (sin JWT en `localStorage`). RBAC cajero vs admin, rate-limits en login/register/settings/upload. Detalle: **CONTRACT.md**.

Smoke scripts: cookie jars (`curl -c/-b`) tras login.
