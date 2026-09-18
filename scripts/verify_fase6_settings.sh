#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://127.0.0.1:8000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/pos_verify_fase6_settings_cookies.txt}"

echo "== health =="
curl -sf "$API/api/health" | tee /tmp/pos_f6_health.json
echo

echo "== login =="
LOGIN=$(curl -sf -c "$COOKIE_JAR" -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@tienditas.com","password":"Admin123!"}')
echo "$LOGIN" | tee /tmp/pos_f6_login.json

echo "== reset singleton to canonical defaults (idempotent) =="
curl -sf -X PUT "$API/api/settings" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"business_name":"Tiendita","brand":{"primary_color":"#ff8a7a","secondary_color":"#c9b1ff","accent_color":"#ffe66d"},"kiosk":{"welcome_text":"¡Bienvenido! Escoge tus productos","logo_url":null},"ticket":{"footer":"¡Gracias por su compra!","show_sku":true,"show_change":true},"whatsapp":{"enabled":false,"default_country_code":"52","message_template":"Hola, aquí está tu ticket de {business_name}. Total: {total}"}}' >/dev/null

echo "== GET seeds defaults =="
GET1=$(curl -sf "$API/api/settings" -b "$COOKIE_JAR")
echo "$GET1" | tee /tmp/pos_f6_get.json
python3 - << 'PY'
import json
d = json.load(open("/tmp/pos_f6_get.json"))
assert isinstance(d["id"], str) and d["id"]
assert d["business_name"] == "Tiendita"
assert d["brand"]["primary_color"] == "#ff8a7a"
assert d["brand"]["secondary_color"] == "#c9b1ff"
assert d["brand"]["accent_color"] == "#ffe66d"
assert "welcome_text" in d["kiosk"] and "logo_url" in d["kiosk"]
assert d["ticket"]["show_sku"] is True and d["ticket"]["show_change"] is True
assert d["whatsapp"]["enabled"] is False
assert d["whatsapp"]["default_country_code"] == "52"
assert "{business_name}" in d["whatsapp"]["message_template"]
assert "{total}" in d["whatsapp"]["message_template"]
assert "store" not in d and "prefs" not in d
open("/tmp/pos_f6_id.txt","w").write(d["id"])
PY
SID=$(cat /tmp/pos_f6_id.txt)

echo "== PATCH deep-merge brand =="
PATCH=$(curl -sf -X PATCH "$API/api/settings" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"business_name":"Mi Tienda","brand":{"primary_color":"#ff5a5f"}}')
echo "$PATCH" | tee /tmp/pos_f6_patch.json
python3 - << PY
import json
d = json.load(open("/tmp/pos_f6_patch.json"))
assert d["id"] == "$SID"
assert d["business_name"] == "Mi Tienda"
assert d["brand"]["primary_color"] == "#ff5a5f"
assert d["brand"]["secondary_color"] == "#c9b1ff"
assert d["brand"]["accent_color"] == "#ffe66d"
PY

echo "== PUT full replace keeps id =="
PUT=$(curl -sf -X PUT "$API/api/settings" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"business_name":"Tienda PUT","brand":{"primary_color":"#c9b1ff","secondary_color":"#b8f2e6","accent_color":"#ffe66d"},"kiosk":{"welcome_text":"Hola kiosko","logo_url":null},"ticket":{"footer":"Gracias","show_sku":false,"show_change":true},"whatsapp":{"enabled":true,"default_country_code":"52","message_template":"Total {total} en {business_name}"}}')
echo "$PUT" | tee /tmp/pos_f6_put.json
python3 - << PY
import json
d = json.load(open("/tmp/pos_f6_put.json"))
assert d["id"] == "$SID"
assert d["business_name"] == "Tienda PUT"
assert d["brand"]["primary_color"] == "#c9b1ff"
assert d["ticket"]["show_sku"] is False
assert d["whatsapp"]["enabled"] is True
assert d["kiosk"]["welcome_text"] == "Hola kiosko"
PY

echo "== validation: empty name / bad color / bad country =="
CODE=$(curl -s -o /tmp/pos_f6_bad_name.json -w '%{http_code}' -X PATCH "$API/api/settings" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"business_name":"   "}')
test "$CODE" = "422"

CODE=$(curl -s -o /tmp/pos_f6_bad_color.json -w '%{http_code}' -X PATCH "$API/api/settings" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"brand":{"primary_color":"red"}}')
test "$CODE" = "422"

CODE=$(curl -s -o /tmp/pos_f6_bad_cc.json -w '%{http_code}' -X PATCH "$API/api/settings" \
  -b "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"whatsapp":{"default_country_code":"MX"}}')
test "$CODE" = "422"

echo "== 401 without token =="
CODE=$(curl -s -o /tmp/pos_f6_unauth.json -w '%{http_code}' "$API/api/settings")
test "$CODE" = "401"

echo "OK fase6"
