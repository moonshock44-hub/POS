"""S3-compatible object storage for product images (MinIO / AWS S3).

Never store Base64 image data in Mongo — only the public URL returned here.
"""
from __future__ import annotations

import mimetypes
import uuid
from typing import Optional

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile, status

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB


def _client(settings: dict):
    return boto3.client(
        "s3",
        endpoint_url=settings["S3_ENDPOINT_URL"],
        aws_access_key_id=settings["S3_ACCESS_KEY"],
        aws_secret_access_key=settings["S3_SECRET_KEY"],
        region_name=settings.get("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def ensure_bucket(settings: dict) -> None:
    """Create bucket if missing (idempotent). Safe to call on startup."""
    bucket = settings["S3_BUCKET"]
    client = _client(settings)
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError:
        try:
            client.create_bucket(Bucket=bucket)
        except ClientError as exc:
            # Race or already exists
            code = exc.response.get("Error", {}).get("Code", "")
            if code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists", "409"):
                print(f"[storage] ensure_bucket warning: {exc}")
    # Public-read policy for product images (dev-friendly MinIO)
    if settings.get("S3_PUBLIC_READ", True):
        policy = (
            '{"Version":"2012-10-17","Statement":[{'
            '"Effect":"Allow","Principal":{"AWS":["*"]},'
            f'"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::{bucket}/*"]'
            "}]}"
        )
        try:
            client.put_bucket_policy(Bucket=bucket, Policy=policy)
        except ClientError as exc:
            print(f"[storage] put_bucket_policy warning: {exc}")


def _public_url(settings: dict, key: str) -> str:
    base = settings.get("S3_PUBLIC_URL") or settings["S3_ENDPOINT_URL"]
    return f"{base.rstrip('/')}/{settings['S3_BUCKET']}/{key}"


async def upload_product_image(file: UploadFile, settings: dict) -> str:
    """Upload multipart file to object storage; return public image_url."""
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de archivo no permitido: {content_type or 'unknown'}. "
            f"Usa: jpeg, png, webp, gif",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Imagen demasiado grande (máx 5 MB)")

    ext = mimetypes.guess_extension(content_type) or ""
    if ext == ".jpe":
        ext = ".jpg"
    key = f"products/{uuid.uuid4().hex}{ext}"

    client = _client(settings)
    try:
        client.put_object(
            Bucket=settings["S3_BUCKET"],
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    except ClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error subiendo imagen a object storage: {exc}",
        ) from exc

    return _public_url(settings, key)
