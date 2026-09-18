#!/usr/bin/env python3
"""Seed sample customers for F3 CxC."""
from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("API", "http://127.0.0.1:8000")
EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@tienditas.com")
PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "Admin123!")

CUSTOMERS = [
    {
        "name": "María López",
        "phone": "5511111111",
        "email": "maria@example.com",
        "notes": "Cliente frecuente",
        "active": True,
    },
    {
        "name": "Carlos Ruiz",
        "phone": "5522222222",
        "email": None,
        "notes": None,
        "active": True,
    },
    {
        "name": "Ana Gómez",
        "phone": "5533333333",
        "email": "ana@example.com",
        "notes": "Crédito semanal",
        "active": True,
    },
]


def req(method: str, path: str, body: dict | None = None, opener=None):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    open_fn = opener.open if opener is not None else urllib.request.urlopen
    with open_fn(r) as resp:
        return json.loads(resp.read().decode())


def main() -> int:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    login = req("POST", "/api/auth/login", body={"email": EMAIL, "password": PASSWORD}, opener=opener)
    assert login.get("user", {}).get("role") == "admin"
    existing = req("GET", "/api/customers?active=false", opener=opener)
    phones = {c["phone"] for c in existing}
    for c in CUSTOMERS:
        if c["phone"] in phones:
            print(f"SKIP {c['phone']} (already exists)")
            continue
        try:
            doc = req("POST", "/api/customers", body=c, opener=opener)
            print(f"OK create {doc['name']} -> {doc['id']} balance={doc['balance']}")
        except urllib.error.HTTPError as e:
            print(f"FAIL {c['phone']}: {e.code} {e.read().decode()}", file=sys.stderr)
            return 1
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
