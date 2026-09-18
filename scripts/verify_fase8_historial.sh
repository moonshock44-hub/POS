#!/usr/bin/env bash
# Optional F8 Historial smoke: list filters + GET /api/sales/{id} + receivables not captured.
set -euo pipefail
API="${API:-http://127.0.0.1:8000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/pos_verify_fase8_historial_cookies.txt}"

echo "== health =="
curl -sf "$API/api/health" >/dev/null

echo "== login =="
LOGIN=$(curl -sf -c "$COOKIE_JAR" -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}')

echo "== list with filters =="
FROM=$(python3 -c "from datetime import datetime; from zoneinfo import ZoneInfo; print(datetime.now(ZoneInfo('America/Mexico_City')).date().replace(day=1).isoformat())")
TO=$(python3 -c "from datetime import datetime; from zoneinfo import ZoneInfo; print(datetime.now(ZoneInfo('America/Mexico_City')).date().isoformat())")
LIST=$(curl -sf "$API/api/sales?from=$FROM&to=$TO&payment_method=cash&limit=10&skip=0" \
  -b "$COOKIE_JAR")
python3 -c "import json,sys; d=json.loads(sys.argv[1]); assert isinstance(d,list); print('count',len(d))" "$LIST"

echo "== create sale for detail =="
SKU="F8-$(date +%s)"
PROD=$(curl -sf -X POST "$API/api/products" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"F8 Item\",\"sku\":\"$SKU\",\"category\":\"Test\",\"unit\":\"pza\",\"stock\":5,\"price\":25,\"cost\":10,\"image_url\":null,\"active\":true}")
PID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "$PROD")
SALE=$(curl -sf -X POST "$API/api/sales" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"product_id\":\"$PID\",\"qty\":1,\"price\":25}],\"payment_method\":\"cash\",\"amount_paid\":25}")
SID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "$SALE")

echo "== GET /api/sales/{id} =="
ONE=$(curl -sf "$API/api/sales/$SID" -b "$COOKIE_JAR")
python3 -c "import json,sys; d=json.loads(sys.argv[1]); assert d['id']==sys.argv[2] and d['payment_method']=='cash'" "$ONE" "$SID"

echo "== 404 unknown id =="
CODE=$(curl -s -o /tmp/pos_f8_404.json -w '%{http_code}' \
  "$API/api/sales/000000000000000000000000" -b "$COOKIE_JAR")
test "$CODE" = "404"

echo "== receivables not captured by {id} =="
curl -sf "$API/api/sales/receivables" -b "$COOKIE_JAR" >/tmp/pos_f8_recv.json
python3 -c "import json; d=json.load(open('/tmp/pos_f8_recv.json')); assert isinstance(d,list)"

echo "OK fase8"
