# Share Worker

Cloudflare Worker that serves published share snapshots from R2 and enforces
authenticated/org scopes using a signed JWT.

## Routes

The worker maps HTTP paths to R2 keys:

- `/share/<share_id>/latest.json`
- `/share/<share_id>/meta.json`
- `/share/<share_id>/manifests/<manifest_id>.json`
- `/share/<share_id>/blobs/<hash>`
- `/share/<share_id>/artifacts/...`

Optional region routing is supported via `/r/<region>/share/<share_id>/...`.
If configured, the worker will look for `SHARES_BUCKET_<REGION>` bindings
before falling back to `SHARES_BUCKET`.

## JWT gating

For `authenticated` and `org` scopes, the worker expects a JWT in:

- `Authorization: Bearer <token>`
- `?token=<token>` or `?share_token=<token>`

The JWT is verified with `SHARE_JWT_SECRET` (HS256) and should include:

- `aud` including `cocalc-share` (default)
- optional `share_id` that must match the requested share

## Environment variables

- `SHARES_BUCKET` (R2 binding)
- `SHARES_BUCKET_<REGION>` (optional R2 bindings, e.g., `SHARES_BUCKET_WNAM`)
- `SHARE_JWT_SECRET`
- `SHARE_JWT_ISSUER` (optional)
- `SHARE_JWT_AUDIENCE` (default `cocalc-share`)
- `SHARE_PUBLIC_CACHE_MAX_AGE` (default 31536000)
- `SHARE_META_CACHE_MAX_AGE` (default 60)
- `SHARE_PRIVATE_CACHE_MAX_AGE` (default 60)

## Example wrangler config

See [wrangler.toml.example](./wrangler.toml.example).
