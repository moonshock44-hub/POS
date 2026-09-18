#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://127.0.0.1:8000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/pos_verify_fase3_customers_cookies.txt}"

echo "== health =="
curl -sf "$API/api/health" | tee /tmp/pos_f3_health.json
echo

echo "== login =="
LOGIN=$(curl -sf -c "$COOKIE_JAR" -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}')
echo "$LOGIN" | tee /tmp/pos_f3_login.json

PHONE="55$(date +%s | tail -c 9)"
echo "== create customer phone=$PHONE =="
CUST=$(curl -sf -X POST "$API/api/customers" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Verify CxC\",\"phone\":\"$PHONE\",\"email\":\"cxc@test.com\",\"notes\":\"f3\",\"active\":true}")
echo "$CUST" | tee /tmp/pos_f3_customer.json
CID=$(python3 -c "import json; print(json.load(open('/tmp/pos_f3_customer.json'))['id'])")
python3 -c "import json; d=json.load(open('/tmp/pos_f3_customer.json')); assert d['balance']==0 and d['active'] is True and isinstance(d['id'], str)"

echo "== list customers default active =="
curl -sf "$API/api/customers" -b "$COOKIE_JAR" | tee /tmp/pos_f3_list.json >/dev/null
python3 -c "import json; d=json.load(open('/tmp/pos_f3_list.json')); assert any(c['id']=='$CID' for c in d)"

echo "== get customer =="
curl -sf "$API/api/customers/$CID" -b "$COOKIE_JAR" | tee /tmp/pos_f3_get.json >/dev/null

echo "== create product for credit sale =="
SKU="CXC-$(date +%s)"
PROD=$(curl -sf -X POST "$API/api/products" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"name\":\"CxC Item\",\"sku\":\"$SKU\",\"category\":\"Test\",\"unit\":\"pza\",\"stock\":20,\"price\":100,\"cost\":50,\"image_url\":null,\"active\":true}")
PID=$(python3 -c "import json,sys; print(json.load(sys.stdin)['id'])" <<<"$PROD")

echo "== partial without customer_id → 400 =="
CODE=$(curl -s -o /tmp/pos_f3_nocust.json -w '%{http_code}' -X POST "$API/api/sales" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"product_id\":\"$PID\",\"qty\":1,\"price\":100}],\"payment_method\":\"cash\",\"amount_paid\":40}")
test "$CODE" = "400"

echo "== partial with customer → balance += amount_due =="
SALE=$(curl -sf -X POST "$API/api/sales" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"product_id\":\"$PID\",\"qty\":1,\"price\":100}],\"payment_method\":\"cash\",\"amount_paid\":40,\"customer_id\":\"$CID\"}")
echo "$SALE" | tee /tmp/pos_f3_sale.json
SID=$(python3 -c "import json; d=json.load(open('/tmp/pos_f3_sale.json')); assert d['payment_status']=='partial' and d['amount_due']==60 and d['customer_id']=='$CID'; print(d['id'])")

curl -sf "$API/api/customers/$CID" -b "$COOKIE_JAR" > /tmp/pos_f3_bal1.json
python3 -c "import json; d=json.load(open('/tmp/pos_f3_bal1.json')); assert d['balance']==60.0"

echo "== second partial sale (FIFO later) =="
SALE2=$(curl -sf -X POST "$API/api/sales" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d "{\"lines\":[{\"product_id\":\"$PID\",\"qty\":1,\"price\":100}],\"payment_method\":\"cash\",\"amount_paid\":80,\"customer_id\":\"$CID\"}")
SID2=$(python3 -c "import json,sys; d=json.load(sys.stdin); assert d['amount_due']==20; print(d['id'])" <<<"$SALE2")
curl -sf "$API/api/customers/$CID" -b "$COOKIE_JAR" > /tmp/pos_f3_bal2.json
python3 -c "import json; d=json.load(open('/tmp/pos_f3_bal2.json')); assert d['balance']==80.0"

echo "== receivables =="
curl -sf "$API/api/sales/receivables" -b "$COOKIE_JAR" | tee /tmp/pos_f3_recv.json >/dev/null
python3 -c "import json; d=json.load(open('/tmp/pos_f3_recv.json')); assert all(s['payment_status']=='partial' for s in d); assert any(s['id']=='$SID' for s in d)"
curl -sf "$API/api/sales/receivables?customer_id=$CID" -b "$COOKIE_JAR" > /tmp/pos_f3_recv_f.json
python3 -c "import json; d=json.load(open('/tmp/pos_f3_recv_f.json')); assert all(s['customer_id']=='$CID' for s in d) and len(d)>=2"

echo "== overpay rejected =="
CODE=$(curl -s -o /tmp/pos_f3_over.json -w '%{http_code}' -X POST "$API/api/customers/$CID/payments" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"amount":9999,"payment_method":"cash","note":"too much"}')
test "$CODE" = "400"

echo "== abono FIFO 50 (covers first sale partial amount_due 60 partially) =="
PAY=$(curl -sf -X POST "$API/api/customers/$CID/payments" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"amount":50,"payment_method":"cash","note":"abono 50"}')
echo "$PAY" | tee /tmp/pos_f3_pay.json
python3 - <<PY
import json
d=json.load(open("/tmp/pos_f3_pay.json"))
assert d["amount"]==50
assert d["balance_after"]==30.0
assert len(d["applied_to"])==1
assert d["applied_to"][0]["sale_id"]=="$SID"
assert d["applied_to"][0]["amount"]==50
assert isinstance(d["id"], str) and isinstance(d["created_by"], str)
PY

echo "== account statement =="
curl -sf "$API/api/customers/$CID/account" -b "$COOKIE_JAR" | tee /tmp/pos_f3_acct.json >/dev/null
python3 - <<PY
import json
d=json.load(open("/tmp/pos_f3_acct.json"))
assert d["customer"]["balance"]==30.0
assert d["customer"]["id"]=="$CID"
# first sale still partial with due 10; second still partial due 20
open_ids={s["id"] for s in d["open_sales"]}
assert "$SID" in open_ids and "$SID2" in open_ids
assert len(d["payments"])>=1
PY

echo "== abono rest 30 → both sales paid, balance 0 =="
PAY2=$(curl -sf -X POST "$API/api/customers/$CID/payments" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"amount":30,"payment_method":"card","note":null}')
echo "$PAY2" | tee /tmp/pos_f3_pay2.json
python3 -c "import json; d=json.load(open('/tmp/pos_f3_pay2.json')); assert d['balance_after']==0.0; assert abs(sum(a['amount'] for a in d['applied_to'])-30)<1e-6"

curl -sf "$API/api/customers/$CID/account" -b "$COOKIE_JAR" > /tmp/pos_f3_acct2.json
python3 -c "import json; d=json.load(open('/tmp/pos_f3_acct2.json')); assert d['customer']['balance']==0.0 and d['open_sales']==[]"

echo "== soft-delete =="
curl -sf -X DELETE "$API/api/customers/$CID" -b "$COOKIE_JAR" > /tmp/pos_f3_del.json
python3 -c "import json; d=json.load(open('/tmp/pos_f3_del.json')); assert d['active'] is False"
# default list excludes
curl -sf "$API/api/customers" -b "$COOKIE_JAR" > /tmp/pos_f3_list2.json
python3 -c "import json; d=json.load(open('/tmp/pos_f3_list2.json')); assert all(c['id']!='$CID' for c in d)"
curl -sf "$API/api/customers?active=false" -b "$COOKIE_JAR" > /tmp/pos_f3_list3.json
python3 -c "import json; d=json.load(open('/tmp/pos_f3_list3.json')); assert any(c['id']=='$CID' for c in d)"

echo "== unauthenticated 401 =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/customers")
test "$CODE" = "401"

echo
echo "OK Fase 3 customers + CxC + receivables"
