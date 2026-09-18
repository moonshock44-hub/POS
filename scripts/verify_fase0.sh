#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://127.0.0.1:8000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/pos_verify_fase0_cookies.txt}"

echo "== health =="
curl -sf "$API/api/health" | tee /tmp/pos_health.json
echo

echo "== login seed admin =="
LOGIN=$(curl -sf -c "$COOKIE_JAR" -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}')
echo "$LOGIN" | tee /tmp/pos_login.json
ROLE=$(python3 -c "import json; print(json.load(open('/tmp/pos_login.json'))['user']['role'])")
test "$ROLE" = "admin"

echo
echo "== /me =="
curl -sf "$API/api/auth/me" -b "$COOKIE_JAR" | tee /tmp/pos_me.json
echo

echo "== register cajero (admin JWT required) =="
RAND=$RANDOM
REG=$(curl -sf -X POST "$API/api/auth/register" \
  -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"cajero${RAND}@test.com\",\"password\":\"Cajero123!\",\"name\":\"Cajero Test\",\"role\":\"cajero\"}")
echo "$REG" | tee /tmp/pos_reg.json
RROLE=$(python3 -c "import json; print(json.load(open('/tmp/pos_reg.json'))['user']['role'])")
test "$RROLE" = "cajero"

echo "== register without token → 401 =="
CODE=$(curl -s -o /tmp/pos_reg_unauth.json -w '%{http_code}' -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"noauth${RAND}@test.com\",\"password\":\"Cajero123!\",\"name\":\"No\",\"role\":\"cajero\"}")
test "$CODE" = "401"

echo
echo "OK Fase 0 auth+health"
