# Desplegar POS Tienditas en Fly.io

Arquitectura: un solo contenedor en Fly.io sirve la API (FastAPI) **y** el
frontend ya compilado (mismo origen → sin problemas de CORS/cookies).
La base de datos y las imágenes viven fuera de Fly, en servicios gratuitos
administrados:

| Pieza | Servicio | Por qué |
|---|---|---|
| App (API + UI) | Fly.io | Un solo `fly deploy`, HTTPS automático |
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
4. En **Network Access**, agrega `0.0.0.0/0` (Fly no tiene IP fija).
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

## 3) Fly.io

Instala `flyctl`: https://fly.io/docs/flyctl/install/

```bash
fly auth login
cd POS
fly launch --no-deploy   # detecta el Dockerfile; dile que NO cree Postgres/Redis
```

Cuando pregunte el nombre de la app, o edita `fly.toml` después con el nombre
que te asigne. No aceptes que te cree una base de datos — ya tenemos Atlas.

### Configura los secretos (nunca van en `fly.toml` ni en el chat)

```bash
fly secrets set `
  MONGO_URL="mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/" `
  JWT_SECRET="pega-aqui-una-cadena-larga-aleatoria" `
  SEED_ADMIN_PASSWORD="EligeUnaPasswordSegura!" `
  S3_ACCESS_KEY="tu-keyID-de-B2" `
  S3_SECRET_KEY="tu-applicationKey-de-B2" `
  S3_ENDPOINT_URL="https://s3.us-west-004.backblazeb2.com" `
  S3_PUBLIC_URL="https://s3.us-west-004.backblazeb2.com" `
  S3_REGION="us-west-004" `
  S3_BUCKET="pos-tienditas"
```

(En PowerShell el backtick ` al final de línea continúa el comando; en
Mac/Linux usa `\` en su lugar.)

Genera un `JWT_SECRET` fuerte con:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Despliega

```bash
fly deploy
```

Al terminar, `fly status` te da la URL pública (algo como
`https://pos-tienditas.fly.dev`). Entra ahí con `admin@tienditas.com` /
la contraseña que pusiste en `SEED_ADMIN_PASSWORD`.

## Actualizar tras un cambio de código

```bash
git pull
fly deploy
```

## Ver logs / diagnosticar

```bash
fly logs
fly status
```
