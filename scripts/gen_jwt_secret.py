#!/usr/bin/env python3
"""Generate a strong JWT_SECRET for .env (JUA-17). Does not write files — print only."""
import secrets
print(secrets.token_urlsafe(48))
