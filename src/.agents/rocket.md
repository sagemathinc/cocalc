# CoCalc Rocket plan (GKE + Cloud SQL + R2 + Cloudflare)

Goal: run the same control-plane functionality as CoCalc Launchpad on GKE with
managed Postgres (Cloud SQL), R2 object storage, Cloudflare DNS, and horizontal
scaling for >=10k concurrent users. Project compute remains on external VMs.

## Phase 0: decisions and scope

- Confirm target hosting: GKE (regional) + Cloud SQL (Postgres 16+) + R2.
- Confirm Cloudflare zone and DNS automation approach.
- Confirm baseline mode: single-tenant, no base path, external project hosts.
- Decide Cloud SQL connectivity:
  - Option A: Private IP + VPC-native GKE (preferred).
  - Option B: Cloud SQL Auth Proxy sidecar (simpler, more moving parts).
- Decide R2 integration path for blobs:
  - Use existing R2/S3 support if already present in server/cloud code.
  - If not, add S3-compatible blob store configuration and move blobs out of DB.

## Phase 1: image build and registry

- Build the Rocket image from the existing hub package \(same as Launchpad\):
  - Ensure the image includes static assets and api/v2 manifest.
  - Confirm COCALC\_DISABLE\_NEXT works in the image.
- Publish to a registry accessible by GKE:
  - Use GCR/Artifact Registry or another container registry.
- Define image tag policy \(e.g., git sha or semver\).
- TODO: we also need a nextjs server \-\- see section "Nextjs site" below.  For the first version we will just use the COCALC\_DISABLE\_NEXT mode.

## Phase 2: Helm chart hardening

- Use src/packages/rocket/helm/rocket as the base chart.
- Add a values schema (values.schema.json) for validation.
- Add GKE profile values file (values-gke.yaml):
  - image.repository / image.tag
  - ingress.hosts and TLS
  - postgres.host, user, database, passwordSecret
  - r2 configuration (env vars and secret refs)
  - disable next server (COCALC_DISABLE_NEXT)
  - conat persist storage class and size
- Ensure conat-persist is single replica and uses fast SSD storage class.
- Add liveness/readiness probes for hub and conat-router.

## Phase 3: Cloud SQL setup

- Create Cloud SQL Postgres instance (regional HA if needed).
- Create database and user for Rocket (smc or rocket-specific).
- Create network connectivity:
  - If private IP: ensure GKE and Cloud SQL share VPC, set firewall rules.
  - If proxy: deploy cloudsql-auth-proxy sidecar or separate deployment.
- Set secrets:
  - Kubernetes secret for DB password.
  - Optional: connection string or host/IP.

## Phase 4: R2 setup

- Create R2 bucket(s) for blobs.
- Create access key and secret.
- Decide on bucket structure and lifecycle rules.
- Add Kubernetes secret for R2 credentials.
- Configure Rocket env vars to use R2 for blobs:
  - Identify exact env vars in code (COCALC_BLOB_STORE or S3 config).
  - Confirm behavior: new blobs go to R2; DB stores metadata only.

## Phase 5: Cloudflare DNS and TLS

- Decide DNS strategy:
  - Use Cloudflare API token to manage DNS for Rocket.
  - For GKE ingress, use external DNS automation or manual records.
- Configure ingress + TLS:
  - Use cert-manager with Cloudflare DNS-01 or managed certs.
  - Set proxied vs DNS-only records (proxy if desired).
- Confirm websocket support and timeout settings.

**QUESTION: could we just use cloudflare tunnel or is it not scalable enough?**

## Phase 6: Deploy on GKE

- Create GKE cluster (regional, autoscaling node pool).
- Install dependencies:
  - ingress-nginx or GKE ingress controller
  - cert-manager (if using DNS-01)
  - external-dns (optional)
- Apply Helm chart with values-gke.yaml.
- Verify:
  - hub is reachable and serves /static
  - /api/v2 endpoints work
  - conat-router service available
  - conat-persist has PVC bound and healthy

## Phase 7: Scaling and performance

- Enable HPA for hub and conat\-router:
  - CPU and request\-based metrics.
  - Tune websocket idle timeouts on ingress.
  - Potential Problem: I think I implemented conat\-router so that you can't change the number of pods \-\- i.e., it efficiently scales to any specific number, but you can't dynamically adjust it at runtime.  I'm not sure. 
- Confirm conat scaling behavior \(router and api\):
  - conat\-router scale horizontally; conat\-persist remains singleton.
- Add cluster autoscaler for node pool.
- Observe memory and CPU on hub, router, and persist pods.

## Phase 8: Operational tooling

- Logging:
  - Stream logs to Cloud Logging or other aggregator.
- Metrics:
  - Prometheus scrape if desired; otherwise use Cloud Monitoring.
- Alerts:
  - Pod restarts, HPA saturation, DB latency.

## Phase 9: Data migration and validation

- Migration path from Launchpad \(pglite\) to Cloud SQL:
  - Export SQL dump from pglite.
  - Import into Cloud SQL.
  - Later: move blobs to bucket
- Validate:
  - Auth flows \(sign up, sign in, password reset\).
    - We also support some SSO \-\- is there a way to offload that to an external provider?
  - Project host management and cloud provisioning.
  - Cloudflare DNS updates for project hosts.

## Phase 10: Load testing

- Simulate >=10k websocket clients:
  - Verify conat-router scaling.
  - Check DB latency under load.
- Verify hub throughput on /api/v2 endpoints.
- Tune resource requests/limits and HPA thresholds.

## Phase 11: Release readiness

- Document install steps for cocalc.ai ops and for enterprise on-prem.
- Provide a minimal example values file.
- Create rollback procedure (helm rollback + DB snapshot).

## Open items

- Decide on Cloud SQL connectivity (private IP vs proxy).
- Decide TLS termination (ingress vs external load balancer).

## Blobs

Implement a new, minimal blobstore suitable for greenfield deployments
(Rocket + Launchpad) with optional Postgres fallback and direct CDN access.

- Scope: only the markdown/chat/file upload blob use case (sha1-addressed data).
  Drop legacy syncstring archival + legacy timetravel blobs for Launchpad/Rocket.
- Add a small blobstore abstraction in the hub:
  - `BlobStore` interface with `put(sha1, buffer, {account_id, project_id})`,
    `get(sha1)`, and `publicUrl(sha1)` (optional) plus `exists`.
  - Implement `S3BlobStore` (R2/S3 compatible) and `PostgresBlobStore`.
- S3/R2 mode (preferred):
  - Store objects at `blobs/<sha1>`; no per-blob metadata in DB.
  - Return a public CDN URL on upload; frontend should use that URL directly.
  - Configure `BLOBS_BASE_URL` (Cloudflare/R2 public URL) for `publicUrl`.
  - Keep hub `/blobs/*` as a compatibility path, but 302 redirect to CDN URL.
- Postgres mode (fallback only):
  - Use the existing `blobs` table but ignore legacy fields; or add a small
    `blobstore` table if we want to avoid touching the legacy schema.
  - Keep `/blobs/*` serving directly from DB in this mode.
- Throttling (abuse control):
  - Add per-account upload limits (bytes + count) over rolling 5h/7d windows.
  - Store usage in a tiny table (e.g., `blob_upload_usage`) keyed by account_id
    and time bucket.
  - Expose limits in server settings (admin UI), not env vars.
- Configuration:
  - New server settings: blob backend (postgres|s3), S3 endpoint/region/bucket,
    access key + secret, public base URL, and per-account limits.
  - For Rocket: wire settings via Helm values and K8s secrets.
- Migration:
  - Provide a one-shot admin tool to move blobs from DB -> S3, then
    optionally delete DB rows.
  - In Launchpad, keep a simple `launchpad blob migrate` helper command.
- Cleanup:
  - Remove or disable old maintenance scripts and GCS blob offload:
    `maintenance-blobs.js`, `maintenance-syncstrings.js`,
    `database/postgres-blobs.coffee` GCS paths, and legacy blob backup.
  - Remove legacy blob entry points used for timetravel.

## Nextjs Site

Treat Next as a separate, optional front-end service for the public site.
Do not couple Next to Rocket/Launchpad.

- Rocket/Launchpad:
  - Keep COCALC_DISABLE_NEXT enabled.
  - Serve a minimal landing + auth flow from the hub (already implemented).
  - All logged-in functionality stays in the SPA/static app.
- cocalc.ai (public site):
  - Run Next in its own deployment (marketing/store/SEO) pointing at the same
    API; keep it optional and isolated from the control plane.
  - Ignore the legacy share server for now.
- Alternative path (if we want to drop Next later):
  - Move the store (memberships/vouchers) into the SPA.
  - Use a static site generator for landing/policy/news pages and host on
    Cloudflare Pages or R2 + CDN.

