from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
from jose import JWTError, jwt


def hash_password(password: str) -> str:
    # bcrypt truncates at 72 bytes
    raw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    raw = plain.encode("utf-8")[:72]
    try:
        return bcrypt.checkpw(raw, hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    subject: str,
    secret: str,
    algorithm: str,
    expire_minutes: int,
    extra: Optional[dict[str, Any]] = None,
) -> str:
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expire_minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_access_token(token: str, secret: str, algorithm: str) -> Optional[dict[str, Any]]:
    try:
        return jwt.decode(token, secret, algorithms=[algorithm])
    except JWTError:
        return None
