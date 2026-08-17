# File Storage

`app/storage/local_provider.py` implements a `StorageProvider` abstraction with one concrete
implementation, `LocalStorageProvider` (writes to `STORAGE_LOCAL_PATH`, default `./uploads`).

## Validation (never trusts the client)

`validate_and_store_image()`:

1. Rejects file extensions outside `{.jpg, .jpeg, .png, .webp}`.
2. Rejects declared `Content-Type` outside the configured `ALLOWED_IMAGE_TYPES`.
3. Rejects files over `MAX_UPLOAD_SIZE_MB` (default 8MB).
4. Checks the actual file bytes against known magic-number signatures (JPEG/PNG/WEBP) — so a file
   renamed to `.jpg` that isn't actually a JPEG is rejected, not just files with a "wrong" extension.
5. **Never uses the client-supplied filename for the storage path** — generates a fresh
   `{purpose}/{uuid4().hex}{ext}` key instead, closing off path-traversal and filename-collision
   issues.

## Future: S3-compatible provider

Add an `S3StorageProvider(StorageProvider)` implementing `save()`/`url_for()` against an S3-
compatible SDK (boto3 or similar), then switch `STORAGE_BACKEND=s3` in `.env` and update
`get_storage_provider()` to branch on it. No other code needs to change — every call site uses the
provider interface, not `LocalStorageProvider` directly.
