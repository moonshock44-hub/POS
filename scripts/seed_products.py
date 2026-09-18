#!/usr/bin/env python3
"""Seed 3 sample products (no images). Odysseo may re-run with real images."""
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

PRODUCTS = [
    {
        "name": "Coca-Cola 600ml",
        "sku": "COCA-600",
        "category": "Bebidas",
        "unit": "pza",
        "stock": 48,
        "price": 18.5,
        "cost": 12.0,
        "image_url": None,
        "active": True,
    },
    {
        "name": "Sabritas Original 45g",
        "sku": "SAB-ORIG-45",
        "category": "Botanas",
        "unit": "pza",
        "stock": 30,
        "price": 17.0,
        "cost": 11.0,
        "image_url": None,
        "active": True,
    },
    {
        "name": "Leche Lala 1L",
        "sku": "LECHE-1L",
        "category": "Lácteos",
        "unit": "pza",
        "stock": 20,
        "price": 28.0,
        "cost": 22.0,
        "image_url": None,
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
    # Session is HttpOnly cookie in jar — no access_token in body.
    created = []
    for p in PRODUCTS:
        try:
            doc = req("POST", "/api/products", body=p, opener=opener)
            created.append(doc)
            print(f"OK create {doc['sku']} -> {doc['id']}")
        except urllib.error.HTTPError as e:
            detail = e.read().decode()
            if e.code == 400 and "SKU" in detail:
                print(f"SKIP {p['sku']} (already exists)")
            else:
                print(f"FAIL {p['sku']}: {e.code} {detail}", file=sys.stderr)
                return 1
    print(json.dumps({"seeded": len(created), "products": created}, default=str, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
