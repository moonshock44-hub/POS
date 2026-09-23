# Desplegar POS Tienditas en Railway

Arquitectura: un solo servicio en Railway construye la imagen a partir del
`Dockerfile` del repo y sirve la API (FastAPI) **y** el frontend ya
compilado desde el mismo origen (sin problemas de CORS/cookies).
La base de datos y las imágenes viven fuera de Railway, en servicios
gratuitos administrados:

| Pieza | Servicio | Por qué |
|---|---|---|
| App (API + UI) | Railway | Deploy directo desde GitHub, detecta el `Dockerfile` solo, sin CLI |
| Base de datos | MongoDB Atlas (M0, gratis) | Sin servidor que mantener, respaldable |
| Imágenes de producto | Backblaze B2 (gratis hasta 10GB) | Compatible con S3 (boto3, sin tocar código) |

> Nota: se probó que Cloudflare R2 tiene un formato de URL pública distinto
> (no incluye el nombre del bucket en la ruta) que no calza con cómo este
> backend arma las URLs (`{S3_PUBLIC_URL}/{bucket}/{key}`). Backblaze B2 sí
> usa ese mismo formato "path-style", por eso se recomienda en vez de R2.

## 1) MongoDB Atlas

1. Crea una cuenta en https://www.mongodb.com/cloud/atlas/register
2. Crea un cluster **M0 (Free)**.
3. En **Database Access**, crea un usuario y contraseña.
4. En **Network Access**, agrega `0.0.0.0/0` (Railway no tiene IP fija).
5. En **Connect → Drivers**, copia el connection string. Se ve así:
   `mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/`

Ese string completo es tu `MONGO_URL`.

## 2) Backblaze B2 (imágenes)

1. Crea una cuenta en https://www.backblaze.com/cloud-storage
2. Crea un bucket (ej. `pos-tienditas`), **público**.
3. En **App Keys**, crea una key con acceso a ese bucket. Te da:
   - `keyID` → `S3_ACCESS_KEY`
   - `applicationKey` → `S3_SECRET_KEY`
4. En la info del bucket verás el **Endpoint S3** (ej.
   `s3.us-west-004.backblazeb2.com`). De ahí sacas:
   - `S3_ENDPOINT_URL` = `https://s3.us-west-004.backblazeb2.com`
   - `S3_PUBLIC_URL` = el mismo valor de arriba
   - `S3_REGION` = la parte `us-west-004`
   - `S3_BUCKET` = el nombre que le pusiste

## 3) Railway

1. Crea una cuenta en https://railway.app (entra con GitHub — no pide
   tarjeta para el trial de $5).
2. **New Project → Deploy from GitHub repo** → elige el repo del proyecto.
3. En **Settings → Source**, confirma que la rama a desplegar sea la que
   tiene el código de la app (no necesariamente `main`).
4. Railway detecta el `Dockerfile` y construye la imagen automáticamente
   (no aceptes que te agregue Postgres/Redis — ya usamos Atlas).
5. En **Settings → Networking**, click **Generate Domain**. Si te pide un
   puerto objetivo (target port), pon **8000** (el que expone el
   `Dockerfile`).

### Variables de entorno

En la pestaña **Variables** del servicio (Raw Editor o una por una):

```
MONGO_URL=mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
JWT_SECRET=pega-aqui-una-cadena-larga-aleatoria
SEED_ADMIN_PASSWORD=EligeUnaPasswordSegura!
COOKIE_SECURE=true
DB_NAME=pos_tienditas
CORS_ORIGINS=
JWT_EXPIRE_MINUTES=720
S3_ACCESS_KEY=tu-keyID-de-B2
S3_SECRET_KEY=tu-applicationKey-de-B2
S3_ENDPOINT_URL=https://s3.us-west-004.backblazeb2.com
S3_PUBLIC_URL=https://s3.us-west-004.backblazeb2.com
S3_REGION=us-west-004
S3_BUCKET=pos-tienditas
S3_PUBLIC_READ=true
```

Genera un `JWT_SECRET` fuerte con:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Al guardar las variables, Railway redespliega automáticamente. Si no lo
hace, dispara un deploy manual desde el botón **Deploy**.

Al terminar, la URL de **Settings → Networking** (algo como
`https://xxxx.up.railway.app`) es tu POS en vivo. Entra ahí con
`admin@tienditas.com` / la contraseña que pusiste en `SEED_ADMIN_PASSWORD`.

## Actualizar tras un cambio de código

Con el repo conectado, Railway redespliega solo con cada `git push` a la
rama configurada. No hace falta ningún comando adicional.

## Ver logs / diagnosticar

En el servicio → pestaña **Deployments** → abre el deployment más
reciente → **Deploy Logs** (runtime) o **Build Logs** (construcción de la
imagen).
