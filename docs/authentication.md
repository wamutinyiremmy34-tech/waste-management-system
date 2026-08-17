# Authentication

## Flow

1. **Register** — `POST /api/v1/auth/register`. Public self-registration is restricted to
   `CITIZEN` and `COLLECTOR` roles only (enforced by a Pydantic validator on the request schema —
   see `app/schemas/auth.py::restrict_self_registration_roles`). Admin-type roles must be
   provisioned by a `SUPER_ADMIN` via `PATCH /api/v1/admin/users/{id}/role`.
2. **Login** — `POST /api/v1/auth/login`. Verifies the bcrypt hash, issues a short-lived JWT
   access token (30 min default) and an opaque refresh token (14 days default).
3. **Refresh** — `POST /api/v1/auth/refresh`. Refresh tokens are stored server-side only as a
   SHA-256 hash (never in plaintext) and are **rotated** on every use: the old token is marked
   revoked and a new pair is issued. Reusing a revoked/expired refresh token returns 401.
4. **Logout** — `POST /api/v1/auth/logout`. Revokes the given refresh token.

## Password handling

- Hashed with `bcrypt` (direct library use, not passlib — see the note below).
- Never logged, never returned in any API response, never stored in `AuditLog` metadata.
- Minimum 8 characters, must contain at least one letter and one digit (`RegisterRequest` validator).

### A real bug we hit and fixed
Initial implementation used `passlib`'s `CryptContext(schemes=["bcrypt"])`. On this environment's
`bcrypt` 5.x, passlib's backend-detection routine (`detect_wrap_bug`) throws
`ValueError: password cannot be longer than 72 bytes` even for short passwords, due to a
passlib/bcrypt version incompatibility (a known upstream issue). Fixed by calling `bcrypt` directly
with explicit 72-byte truncation (bcrypt's own hard input limit) instead of going through passlib.

## Tokens

- **Access token**: JWT (HS256), contains `sub` (user ID), `role`, `type: "access"`, `jti`, `iat`,
  `exp`. Verified on every request via the `get_current_user` dependency.
- **Refresh token**: opaque random string (`secrets.token_urlsafe(48)`), not a JWT — this means a
  compromised refresh token reveals nothing about its own validity/expiry without a DB lookup, and
  revocation is a simple DB flag rather than needing a JWT blocklist.

## Session/token invalidation

- Logout revokes the specific refresh token used.
- Refresh rotation revokes the previous refresh token on every use, limiting the blast radius of a
  leaked refresh token to a single use.
- Deactivating a user (`is_active = false`) immediately blocks both login and any further use of
  their existing access tokens (checked in `get_current_user`).

## What's not implemented (documented, not faked)

- Password reset — the `PasswordResetToken` table and hashing helpers exist, but the email-sending
  flow is not wired up (see `docs/notifications.md` — no email provider is configured in the MVP).
- Email verification — `is_email_verified` exists on the `User` model but no verification email flow
  is implemented for the same reason.
