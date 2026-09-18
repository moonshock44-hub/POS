#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://127.0.0.1:8000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/pos_verify_fase2_sales_cookies.txt}"

echo "== health =="
curl -sf "$API/api/health" | tee /tmp/pos_f2_health.json
echo

echo "== login =="
LOGIN=$(curl -sf -c "$COOKIE_JAR" -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}')
echo "$LOGIN" | tee /tmp/pos_f2_login.json

SKU="SALE-$(date +%s)"
echo "== create product stock=10 sku=$SKU =="
CREATE=$(curl -sf -X POST "$API/api/products" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Sale Smoke\",\"sku\":\"$SKU\",\"category\":\"Test\",\"unit\":\"pza\",\"stock\":10,\"price\":18.5,\"cost\":10,\"image_url\":null,\"active\":true}")
echo "$CREATE" | tee /tmp/pos_f2_product.json
PID=$(python3 -c "import json; print(json.load(open('/tmp/pos_f2_product.json'))['id'])")

echo "== sale paid (cash overpay) =="
SALE=$(curl -sf -X POST "$API/api/sales" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"product_id\":\"$PID\",\"qty\":2,\"price\":18.5}],\"payment_method\":\"cash\",\"amount_paid\":40}")
echo "$SALE" | tee /tmp/pos_f2_sale.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/pos_f2_sale.json"))
assert d["total"]==37.0
assert d["payment_status"]=="paid"
assert d["amount_due"]==0.0
assert d["change"]==3.0
assert d["lines"][0]["line_total"]==37.0
assert isinstance(d["id"], str) and isinstance(d["created_by"], str)
PY

echo "== stock after sale =="
curl -sf "$API/api/products/$PID" -b "$COOKIE_JAR" | tee /tmp/pos_f2_prod_after.json
python3 -c "import json; d=json.load(open('/tmp/pos_f2_prod_after.json')); assert d['stock']==8"

echo "== create customer for partial credit =="
CUST=$(curl -sf -X POST "$API/api/customers" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"name":"F2 Verify Customer","phone":"5500000002","email":null,"notes":"f2-verify","active":true}')
echo "$CUST" | tee /tmp/pos_f2_customer.json
CID=$(python3 -c "import json; print(json.load(open('/tmp/pos_f2_customer.json'))['id'])")

echo "== partial credit =="
PART=$(curl -sf -X POST "$API/api/sales" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"product_id\":\"$PID\",\"qty\":1,\"price\":18.5}],\"payment_method\":\"card\",\"amount_paid\":10,\"customer_id\":\"$CID\"}")
echo "$PART" | tee /tmp/pos_f2_partial.json
python3 -c "import json; d=json.load(open('/tmp/pos_f2_partial.json')); assert d['payment_status']=='partial' and d['amount_due']==8.5 and d['change']==0 and d.get('customer_id')"

echo "== insufficient stock rejected + no partial =="
CODE=$(curl -s -o /tmp/pos_f2_nosale.json -w '%{http_code}' -X POST "$API/api/sales" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"product_id\":\"$PID\",\"qty\":999,\"price\":1}],\"payment_method\":\"cash\",\"amount_paid\":0}")
test "$CODE" = "400"
curl -sf "$API/api/products/$PID" -b "$COOKIE_JAR" > /tmp/pos_f2_stock_final.json
python3 -c "import json; d=json.load(open('/tmp/pos_f2_stock_final.json')); assert d['stock']==7"

echo "== unknown product 404 =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/sales" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"lines":[{"product_id":"000000000000000000000000","qty":1,"price":1}],"payment_method":"cash","amount_paid":1}')
test "$CODE" = "404"

echo "== unauthenticated 401 =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/sales" \
  -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"product_id\":\"$PID\",\"qty\":1,\"price\":1}],\"payment_method\":\"cash\",\"amount_paid\":1}")
test "$CODE" = "401"

echo
echo "OK Fase 2 sales + payment + atomic stock"
