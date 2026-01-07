# Licensing plan (Rocket + Launchpad)

Goal: add clear, enforceable, user-friendly licensing for honest users. The
system should make it obvious what is allowed, allow feature gating, support
expiry, and allow revocation with online refresh. Assume attackers can modify
source/binaries; focus on practical enforcement and good UX.

## Phase 0: Decisions and scope

- License format: signed JSON token (Ed25519). No encryption needed.
- Trust model: app embeds public key; only backend signs licenses.
- Binding model: optional instance binding using a local instance keypair.
- Refresh model:
  - Launchpad: offline-first with grace period.
  - Rocket: online-preferred with periodic refresh.
- Failure mode: degrade features when invalid/expired, do not crash.

## Phase 1: Data model and keys

- License payload fields (draft):
  - product: "launchpad" | "rocket"
  - license_id, customer_id
  - issued_at, valid_from, expires_at
  - refresh_interval_hours, grace_days
  - features: list or bitmask (e.g., "cloud_hosts", "ai", "billing", "support")
  - limits: max_users, max_project_hosts, max_ai_spend, max_storage_gb
  - require_online_refresh: boolean
  - instance_binding: "none" | "instance_pubkey"
- Activation payload (if binding enabled):
  - instance_pubkey, license_id, activation_id, activated_at
- Store in database:
  - licenses table (raw token + parsed fields + status)
  - license_activations table (optional binding data)
  - last_refresh_at, last_seen_at, last_error, revoked_at
- Instance keypair storage:
  - Launchpad: local data dir (same as pglite data dir)
  - Rocket: K8s Secret or PVC

## Phase 2: Core verifier library (shared)

- Implement a small shared verifier module:
  - parse token
  - validate signature (Ed25519)
  - validate time range and feature flags
  - validate instance binding (optional)
  - provide a normalized result (valid, expired, needs_refresh, feature flags)
- Keep it deterministic and side-effect free (unit-testable).

## Phase 3: License service endpoints (hub)

- Add internal endpoints:
  - POST /api/license/activate
  - POST /api/license/refresh
  - GET /api/license/status
- Activation flow:
  - client sends license token + instance_pubkey
  - hub verifies token and writes activation record
  - returns activation token (signed by licensing service)
- Refresh flow:
  - hub verifies license + activation, updates last_refresh_at
  - optionally contacts licensing server for revocation status

## Phase 4: External licensing service

- Add a minimal service (can be separate repo later):
  - generate licenses (admin-only)
  - refresh endpoint to return revocation status
  - list revoke/restore
- Keep this simple and secure:
  - sign with offline private key or secure CI secret
  - audit logs for activations and refreshes

## Phase 5: Enforcement points

- On hub startup:
  - load license token from settings
  - validate signature + time + features
  - if invalid: restrict to "license needed" pages only
- On actions:
  - block or degrade when exceeding limits:
    - create account
    - create project host
    - enable AI services
  - warn and allow read-only on expiration
- Store limit checks in one central place to avoid scattered logic.

## Phase 6: UX (admin + user)

- Admin UI panel:
  - upload license token
  - show status, expiry, last refresh, features, limits
  - show warnings before expiry
- User messaging:
  - clear banners when near expiry or out of compliance
  - link to admin panel only for admins
- First-run flow (Launchpad):
  - if no license is configured, show a setup screen

## Phase 7: Offline and revocation behavior

- Launchpad:
  - allow offline use with grace_days after expiry
  - block new accounts / hosts when expired beyond grace
- Rocket:
  - require refresh every N hours
  - if refresh fails: enter grace, then degrade features
- Revocation:
  - only enforce online revocation (cannot fully enforce offline)

## Phase 8: Settings and configuration

- Add server settings for:
  - license_token (string or file upload)
  - licensing service URL
  - refresh interval override (if needed)
- For Rocket:
  - K8s Secret for license token
  - optional licensing service URL in values.yaml

## Phase 9: Tests and tooling

- Unit tests:
  - signature verification
  - expiry + grace
  - feature gating
  - instance binding match/mismatch
- Integration tests:
  - activation + refresh
  - revocation path
- Admin CLI:
  - "launchpad license status"
  - "launchpad license install <token>"
  - "launchpad license refresh"

## Phase 10: Migration and rollout

- Launchpad beta:
  - start in "warn-only" mode for early testers
  - then enforce limits and expiry
- Rocket:
  - enforce refresh and revocation from day one

## Telemetry (clear disclosure + minimal scope)

Goal: collect a small, well-defined set of usage metrics to support licensing
compliance, capacity planning, and product improvements. This must be explicit,
opt-in (or at least clearly documented with a simple opt-out), and visible in
the admin UI.

- Principles:
  - Minimal, aggregated, non-content data only.
  - No user content, file names, project data, or message contents.
  - Short retention on the server side unless the customer opts in to longer.
  - Clear UX: show what is collected and why, with a toggle.
- Suggested data:
  - Instance info: product (launchpad/rocket), version, license_id.
  - Usage aggregates (daily/weekly):
    - active users (unique account_id count, anonymized hash optional)
    - active project hosts (count)
    - API calls count (per endpoint group)
    - total blob uploads (count + bytes)
    - total AI requests (count + tokens if available)
  - Health signals: uptime, failed refresh attempts, license status changes.
- Transport and storage:
  - Ship telemetry during license refresh (same endpoint) to avoid new network
    dependencies.
  - Store only aggregates in the licensing service; keep raw events local.
- UX:
  - Admin settings page shows current telemetry status and a “View details”
    modal with the exact fields.
  - Provide a “Disable telemetry” toggle, with a note that some support features
    may be limited.

## Open questions

- Which feature flags should be enforced first?
- Should instance binding be mandatory for Rocket?
- How strict should the default grace period be?
