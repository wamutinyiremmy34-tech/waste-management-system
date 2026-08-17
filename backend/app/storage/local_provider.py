"""
Storage abstraction (spec section 6). Local disk backend for the MVP; an
S3-compatible provider can be dropped in later by implementing the same
StorageProvider interface — nothing above this layer needs to change.
"""
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class StorageProvider(ABC):
    @abstractmethod
    def save(self, file_bytes: bytes, storage_key: str, content_type: str) -> str:
        ...

    @abstractmethod
    def url_for(self, storage_key: str) -> str:
        ...


class LocalStorageProvider(StorageProvider):
    def __init__(self, base_path: str = settings.STORAGE_LOCAL_PATH):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def save(self, file_bytes: bytes, storage_key: str, content_type: str) -> str:
        path = self.base_path / storage_key
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            f.write(file_bytes)
        return storage_key

    def url_for(self, storage_key: str) -> str:
        return f"/uploads/{storage_key}"


def get_storage_provider() -> StorageProvider:
    # Future: if settings.STORAGE_BACKEND == "s3": return S3StorageProvider(...)
    return LocalStorageProvider()


async def validate_and_store_image(upload: UploadFile, purpose: str) -> dict:
    """
    Validates an uploaded image (never trusting the client-supplied filename
    or declared content-type alone) and stores it via the configured
    provider. Returns metadata suitable for a FileAsset row.
    """
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Unsupported file extension: {ext}")

    if upload.content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Unsupported content type: {upload.content_type}")

    contents = await upload.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="File exceeds maximum upload size")

    # Minimal magic-byte sanity check (real image content, not just extension).
    magic_signatures = {
        b"\xff\xd8\xff": "image/jpeg",
        b"\x89PNG\r\n\x1a\n": "image/png",
        b"RIFF": "image/webp",  # WEBP starts with RIFF....WEBP
    }
    if not any(contents.startswith(sig) for sig in magic_signatures):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="File content does not match a supported image format")

    # Never trust the client filename — generate our own storage key.
    storage_key = f"{purpose}/{uuid.uuid4().hex}{ext}"
    provider = get_storage_provider()
    provider.save(contents, storage_key, upload.content_type)

    return {
        "storage_key": storage_key,
        "original_filename": upload.filename,
        "content_type": upload.content_type,
        "size_bytes": len(contents),
        "purpose": purpose,
        "url": provider.url_for(storage_key),
    }
