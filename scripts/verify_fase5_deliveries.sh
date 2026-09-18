#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://127.0.0.1:8000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/pos_verify_fase5_deliveries_cookies.txt}"

echo "== health =="
curl -sf "$API/api/health" | tee /tmp/pos_f5_health.json
echo

echo "== login =="
LOGIN=$(curl -sf -c "$COOKIE_JAR" -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}')
echo "$LOGIN" | tee /tmp/pos_f5_login.json

echo "== create driver =="
DRV=$(curl -sf -X POST "$API/api/deliveries" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"name":"Verify Driver","phone":"5599990001","notes":"f5","active":true}')
echo "$DRV" | tee /tmp/pos_f5_driver.json
DID=$(python3 -c "import json; d=json.load(open('/tmp/pos_f5_driver.json')); assert d['active'] is True and isinstance(d['id'], str); print(d['id'])")

echo "== list drivers =="
curl -sf "$API/api/deliveries" -b "$COOKIE_JAR" > /tmp/pos_f5_list.json
python3 -c "import json; d=json.load(open('/tmp/pos_f5_list.json')); assert any(x['id']=='$DID' for x in d)"

echo "== create product + sale =="
SKU="F5-$(date +%s)"
PROD=$(curl -sf -X POST "$API/api/products" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"F5 Item\",\"sku\":\"$SKU\",\"category\":\"Test\",\"unit\":\"pza\",\"stock\":10,\"price\":50,\"cost\":20,\"image_url\":null,\"active\":true}")
PID=$(python3 -c "import json,sys; print(json.load(sys.stdin)['id'])" <<<"$PROD")

SALE=$(curl -sf -X POST "$API/api/sales" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"product_id\":\"$PID\",\"qty\":1,\"price\":50}],\"payment_method\":\"cash\",\"amount_paid\":50}")
echo "$SALE" | tee /tmp/pos_f5_sale.json
SID=$(python3 -c "import json; d=json.load(open('/tmp/pos_f5_sale.json')); assert d.get('delivery_driver_id') is None and d.get('delivery_status') is None; print(d['id'])")

echo "== PATCH sale delivery =="
UPD=$(curl -sf -X PATCH "$API/api/sales/$SID/delivery" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"delivery_driver_id\":\"$DID\",\"delivery_status\":\"assigned\"}")
echo "$UPD" | tee /tmp/pos_f5_sale_del.json
python3 -c "import json; d=json.load(open('/tmp/pos_f5_sale_del.json')); assert d['delivery_driver_id']=='$DID' and d['delivery_status']=='assigned'"

echo "== inactive driver rejected =="
curl -sf -X DELETE "$API/api/deliveries/$DID" -b "$COOKIE_JAR" >/dev/null
CODE=$(curl -s -o /tmp/pos_f5_inactive.json -w '%{http_code}' -X PATCH "$API/api/sales/$SID/delivery" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"delivery_driver_id\":\"$DID\",\"delivery_status\":\"out\"}")
test "$CODE" = "400"

echo "OK fase5"
