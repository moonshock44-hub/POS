#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://127.0.0.1:8000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/pos_verify_fase1_products_cookies.txt}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== health =="
curl -sf "$API/api/health" | tee /tmp/pos_f1_health.json
echo

echo "== login =="
LOGIN=$(curl -sf -c "$COOKIE_JAR" -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}')
echo "$LOGIN" | tee /tmp/pos_f1_login.json

# tiny 1x1 PNG
PNG=/tmp/pos_f1_sample.png
python3 - <<'PY'
import base64, pathlib
# 1x1 red PNG
b = base64.b64decode(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
pathlib.Path("/tmp/pos_f1_sample.png").write_bytes(b)
PY

echo
echo "== upload image =="
UPLOAD=$(curl -sf -X POST "$API/api/products/upload" \
  -b "$COOKIE_JAR" \
  -F "file=@${PNG}")
echo "$UPLOAD" | tee /tmp/pos_f1_upload.json
IMAGE_URL=$(python3 -c "import json; print(json.load(open('/tmp/pos_f1_upload.json'))['image_url'])")
test -n "$IMAGE_URL"
# Ensure not base64 data URI
python3 -c "u='$IMAGE_URL'; assert not u.startswith('data:'), u; assert 'http' in u, u"

SKU="SMOKE-$(date +%s)"
echo
echo "== create product sku=$SKU =="
CREATE=$(curl -sf -X POST "$API/api/products" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Product\",\"sku\":\"$SKU\",\"category\":\"Test\",\"unit\":\"pza\",\"stock\":5,\"price\":10,\"cost\":6,\"image_url\":\"$IMAGE_URL\",\"active\":true}")
echo "$CREATE" | tee /tmp/pos_f1_create.json
PID=$(python3 -c "import json; print(json.load(open('/tmp/pos_f1_create.json'))['id'])")
# Mongo must not contain base64 blob
python3 -c "import json; d=json.load(open('/tmp/pos_f1_create.json')); assert isinstance(d['image_url'], str); assert not d['image_url'].startswith('data:')"

echo
echo "== get =="
curl -sf "$API/api/products/$PID" -b "$COOKIE_JAR" | tee /tmp/pos_f1_get.json
echo

echo "== list active =="
curl -sf "$API/api/products" -b "$COOKIE_JAR" | tee /tmp/pos_f1_list.json > /dev/null
python3 -c "import json; xs=json.load(open('/tmp/pos_f1_list.json')); assert any(x['id']=='$PID' for x in xs)"

echo "== update =="
curl -sf -X PUT "$API/api/products/$PID" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Updated\",\"sku\":\"$SKU\",\"category\":\"Test\",\"unit\":\"pza\",\"stock\":9,\"price\":11,\"cost\":6,\"image_url\":\"$IMAGE_URL\",\"active\":true}" \
  | tee /tmp/pos_f1_update.json
python3 -c "import json; d=json.load(open('/tmp/pos_f1_update.json')); assert d['name']=='Smoke Updated' and d['stock']==9"

echo
echo "== soft-delete =="
curl -sf -X DELETE "$API/api/products/$PID" -b "$COOKIE_JAR" | tee /tmp/pos_f1_del.json
python3 -c "import json; d=json.load(open('/tmp/pos_f1_del.json')); assert d['active'] is False"

echo
echo "== list excludes soft-deleted by default =="
curl -sf "$API/api/products" -b "$COOKIE_JAR" > /tmp/pos_f1_list2.json
python3 -c "import json; xs=json.load(open('/tmp/pos_f1_list2.json')); assert not any(x['id']=='$PID' for x in xs)"

echo "== list with active=false includes it =="
curl -sf "$API/api/products?active=false" -b "$COOKIE_JAR" > /tmp/pos_f1_list3.json
python3 -c "import json; xs=json.load(open('/tmp/pos_f1_list3.json')); assert any(x['id']=='$PID' and x['active'] is False for x in xs)"

echo
echo "== unauthenticated rejected =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/products")
test "$CODE" = "401"

echo
echo "OK Fase 1 products CRUD + upload"
