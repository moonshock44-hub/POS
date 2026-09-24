"""Auth routes: login, me, logout; register solo admin."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from models.user import TokenResponse, UserCreate, UserLogin, UserPublic, UserUpdate
from utils.rate_limit import enforce_rate_limit
from utils.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)

COOKIE_NAME = "access_token"


def get_settings(request: Request):
    return request.app.state.settings


def get_db(request: Request):
    return request.app.state.db


async def get_current_user(
    request: Request,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)],
):
    """Resolve user from HttpOnly cookie `access_token` (SPA primary).

    Bearer Authorization is still accepted for smoke scripts / curl only —
    the web client must not store or send tokens from localStorage.
    """
    settings = get_settings(request)
    db = get_db(request)
    token: Optional[str] = None
    # Cookie first (browser SPA); Bearer fallback for scripts.
    token = request.cookies.get(COOKIE_NAME)
    if not token and credentials and credentials.credentials:
        token = credentials.credentials

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")

    payload = decode_access_token(token, settings["JWT_SECRET"], settings["JWT_ALGORITHM"])
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    try:
        user_id = ObjectId(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = await db.users.find_one({"_id": user_id})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    # JUA-20 F10: role despacho is confined to /api/despacho/* + /api/auth/me
    # (logout/login do not use this dependency). Prefer path gate here over
    # editing every route; require_cashier_access remains as a belt-and-suspenders.
    if user.get("role") == "despacho":
        path = request.url.path
        if path != "/api/auth/me" and not path.startswith("/api/despacho"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rol despacho no tiene acceso a este recurso",
            )
    return user


def require_admin(user=Depends(get_current_user)):
    """Solo rol admin — gate server-side (UI sola no basta)."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol admin",
        )
    return user


def require_despacho_access(user=Depends(get_current_user)):
    """F10 Despacho — allow only admin|despacho; cajero → 403."""
    if user.get("role") not in ("admin", "despacho"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol despacho o admin",
        )
    return user


def require_cashier_access(user=Depends(get_current_user)):
    """Staff POS (admin|cajero). Despacho blocked outside /api/despacho (belt+suspenders)."""
    if user.get("role") not in ("admin", "cajero"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Rol despacho no tiene acceso a este recurso",
        )
    return user


def _cookie_flags(settings: dict) -> dict:
    """
    SameSite=None exige Secure; en HTTP local usamos Lax + Secure=False
    para que la cookie se envíe same-site sin quedar en estado inválido.
    """
    secure = bool(settings.get("COOKIE_SECURE", False))
    return {
        "httponly": True,
        "secure": secure,
        "samesite": "none" if secure else "lax",
        "path": "/",
    }


def _set_auth_cookie(response: Response, token: str, settings: dict) -> None:
    flags = _cookie_flags(settings)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings["JWT_EXPIRE_MINUTES"] * 60,
        **flags,
    )


def _clear_auth_cookie(response: Response, settings: dict) -> None:
    flags = _cookie_flags(settings)
    response.delete_cookie(COOKIE_NAME, **flags)


@router.post("/register", response_model=TokenResponse, response_model_exclude_none=True, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserCreate,
    request: Request,
    response: Response,
    _admin=Depends(require_admin),
):
    """Crear usuario (admin|cajero|despacho) — solo admin autenticado (no registro público)."""
    settings = get_settings(request)
    enforce_rate_limit(
        request,
        bucket="register",
        limit=int(settings.get("RATE_LIMIT_REGISTER_PER_MIN", 3)),
    )
    db = get_db(request)

    if body.role not in ("admin", "cajero", "despacho"):
        raise HTTPException(status_code=400, detail="Rol inválido (admin|cajero|despacho)")

    existing = await db.users.find_one({"username": body.username})
    if existing:
        raise HTTPException(status_code=400, detail="El usuario ya está registrado")

    now = datetime.now(timezone.utc)
    doc = {
        "username": body.username,
        "name": body.name.strip(),
        "hashed_password": hash_password(body.password),
        "role": body.role,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id

    # No setear cookie ni devolver JWT: el admin creador no debe perder su sesión.
    # El usuario nuevo inicia sesión por /login (cookie HttpOnly).
    return TokenResponse(user=UserPublic.from_doc(doc))


@router.post("/login", response_model=TokenResponse, response_model_exclude_none=True)
async def login(body: UserLogin, request: Request, response: Response):
    settings = get_settings(request)
    enforce_rate_limit(
        request,
        bucket="login",
        limit=int(settings.get("RATE_LIMIT_LOGIN_PER_MIN", 5)),
    )
    db = get_db(request)

    user = await db.users.find_one({"username": body.username})
    if not user or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Usuario desactivado")

    token = create_access_token(
        str(user["_id"]),
        settings["JWT_SECRET"],
        settings["JWT_ALGORITHM"],
        settings["JWT_EXPIRE_MINUTES"],
        extra={"role": user["role"], "username": user["username"]},
    )
    _set_auth_cookie(response, token, settings)
    # Cookie HttpOnly is the session — do not return JWT in body for web clients.
    # Smoke scripts: curl -c/-b cookie jar (Bearer still accepted in get_current_user).
    return TokenResponse(user=UserPublic.from_doc(user))


@router.get("/me", response_model=UserPublic)
async def me(user=Depends(get_current_user)):
    return UserPublic.from_doc(user)


@router.get("/users", response_model=list[UserPublic])
async def list_users(request: Request, _admin=Depends(require_admin)):
    """Admin-only — for the Usuarios management screen."""
    db = get_db(request)
    docs = await db.users.find().sort("created_at", 1).to_list(500)
    return [UserPublic.from_doc(d) for d in docs]


@router.patch("/users/{user_id}", response_model=UserPublic)
async def update_user(
    user_id: str,
    body: UserUpdate,
    request: Request,
    admin=Depends(require_admin),
):
    """Admin-only — change role and/or active status. Cannot self-demote/deactivate."""
    try:
        oid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Id inválido")

    db = get_db(request)
    target = await db.users.find_one({"_id": oid})
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return UserPublic.from_doc(target)

    if str(target["_id"]) == str(admin["_id"]):
        if updates.get("is_active") is False or (
            "role" in updates and updates["role"] != "admin"
        ):
            raise HTTPException(
                status_code=400, detail="No puedes desactivarte ni quitarte el rol admin"
            )

    updates["updated_at"] = datetime.now(timezone.utc)
    await db.users.update_one({"_id": oid}, {"$set": updates})
    target = await db.users.find_one({"_id": oid})
    return UserPublic.from_doc(target)


@router.post("/logout")
async def logout(request: Request, response: Response):
    settings = get_settings(request)
    _clear_auth_cookie(response, settings)
    return {"ok": True}
