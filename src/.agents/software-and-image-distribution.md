# Software and RootFS Image Distribution Plan

This plan covers:

- Software artifacts (project-host + project SEA bundles).
- RootFS images for project containers (btrfs subvolumes).

## Goals

- Make bootstrapping reliable and fast across clouds.
- Avoid SSH polling for artifact delivery \(cloud\-init fetches artifacts\).
- Keep artifacts public \(no secrets\), but verify integrity.
- Keep downloads fast via Cloudflare caching in front of R2.
- Allow incremental rollout \(fallbacks kept while cloud\-init matures\).
- ARM support \-\- we will also support non\-x86 architecture hosts, because:
  - MacOS with multipass
  - lambda cloud's cheapest h100 is ARM

## Software Artifacts (SEA) Distribution

### Artifact layout

- Use a single public R2 bucket for software artifacts.
- Key layout (versioned):
  - `software/project-host/<version>/cocalc-project-host-<version>-<arch>-<os>.tar.xz`
  - `software/project/<version>/bundle.tar.xz`
  - `software/tools/<version>/tools.tar.xz`
- Metadata per artifact:
  - `<artifact>.sha256` (sha256 + filename)
- Small "latest" manifests:
  - `software/project-host/latest.json`
  - `software/project/latest.json`
  - `software/tools/latest.json`
  - Example fields: `version`, `url`, `sha256`, `size_bytes`, `built_at`, `arch`, `os`.

### Publishing workflow

- Build SEA bundle as today.
- After build:
  - Compute sha256 + size.
  - Upload the tarball and `.sha256`.
  - Upload/update the `latest.json` manifest.
- Cache headers:
  - Versioned artifacts: `Cache-Control: public, max-age=31536000, immutable`.
  - `latest.json`: `Cache-Control: public, max-age=300`.

### Consumption

- Cloud-init script downloads `latest.json`, fetches URL, verifies sha256, unpacks.
- Bootstrap code keeps existing `project_hosts_sea_url` as a direct override for now.
- Once cloud-init is stable, SSH/scp is removed.

### R2 + Cloudflare

- R2 bucket is public (or served via a Cloudflare Worker/Domain).
- Cloudflare edge caches artifacts automatically for global latency reduction.
- Optional: set a custom hostname like `artifacts.cocalc.ai`.

### Release discipline

- Artifacts are immutable (versioned keys).
- Roll forward by updating `latest.json`.
- Roll back by pointing `latest.json` back to a prior version.

## Upgrade Strategy

### Objectives

- Admin can see the running project-host version and project bundle version per host.
- Admin can trigger upgrade to latest or choose a specific version.
- Rollback is fast and safe.
- Upgrading project-host does not restart running project containers.
- Upgrading bundles only affects new project starts.

### Model

- Keep immutable versions on each host and use atomic symlinks.
  - `/opt/cocalc/project-host/versions/<ver>/...`
  - `/opt/cocalc/project-host/current -> versions/<ver>`
  - `/opt/cocalc/project-bundles/<ver>/...`
  - `/opt/cocalc/project-bundles/current -> <ver>`
- When starting a project, resolve the real bundle path (not the symlink) so
  running containers keep using the old bundle if `current` changes.

### Version reporting

- Project-host reports `project_host_version` and `project_bundle_version`
  to the master (store in host metadata and show in UI).

### Upgrade flow (project-host)

1) Master resolves a concrete version from `latest.json` (or user-specified).
2) Host downloads and verifies sha256 into a staging directory.
3) Extract to `/opt/cocalc/project-host/versions/<ver>/`.
4) Atomically flip `/opt/cocalc/project-host/current` to the new version.
5) Restart only the project-host process.
6) Health check; on failure, flip back and restart.

### Upgrade flow (project bundle)

1) Master resolves version from `software/project/latest.json` (or specified).
2) Host downloads and verifies into `/opt/cocalc/project-bundles/<ver>/`.
3) Atomically flip `/opt/cocalc/project-bundles/current`.
4) No container restarts; new projects use the new bundle.

### Rollback and retention

- Keep at least one prior version (e.g., `previous` symlink or keep last 2).
- Provide a "prune old versions" action with a max retention cap.

### Implementation checklist

- Add software version discovery on project-host (project-host, project bundle, tools).
- Include versions in host registration/heartbeat payload.
- Store versions on the hub and expose via host list API.
- Show versions in the hosts UI (details drawer at minimum).
- Extend host control API with `upgradeSoftware` (targets + channel/version).
- Implement host-side upgrade executor:
  - download + verify sha256
  - extract into versioned dir
  - atomic `current` symlink flip
  - optional project-host restart
- Add a hub endpoint + UI button to trigger “upgrade to latest”.
- Add rollback support via explicit version selection.
- Add basic retention/prune command (keep last N versions).
- Log upgrade status + surface errors in the host drawer.

## RootFS Distribution (btrfs subvolumes)

### Current model

- A single shared rootfs per image on each host.
- Rootfs stored on `/btrfs`, with per-project overlayfs.
- We want to avoid repeated pull+extract for common images.

### Proposed cache format

- Primary format: btrfs send stream of a rootfs subvolume.
- Secondary (fallback): tar.zst of the rootfs directory.
- Each image has a content-addressed key derived from:
  - registry image ref + digest + env (gpu/cpu) + architecture.

### Publishing workflow (lazy, on-demand)

- If a host needs a rootfs and it is missing locally:
  1) Pull image, expand to `/btrfs/rootfs/<key>`.
  2) Start project (fast path).
  3) In background, create a btrfs send stream and upload to R2.
- Any trusted host can act as the builder/uploader.
- Upload metadata:
  - `rootfs/<key>.btrfs` (send stream)
  - `rootfs/<key>.sha256`
  - `rootfs/<key>.json` (size, build host, created_at, base image digest)

### Consumption workflow

- On host start or when a project needs an image:
  - Check local cache (subvolume exists).
  - If missing, fetch `rootfs/<key>.json` from R2.
  - Download stream + verify sha256.
  - `btrfs receive` into `/btrfs/rootfs/<key>`.
  - If receive fails, fall back to tar.zst (if present) or pull from registry.

### Cache + GC

- Maintain per-host refcounts for subvolumes.
- Periodically GC unused rootfs subvolumes.
- Keep a small LRU cache of recently used images.

### Security and trust

- Only trusted hosts upload to R2.
- Consumers verify sha256 before use.
- Optional future step: sign manifests with a server key.

## Optional: OCI Registry Backed by R2

### Why

- Avoid DockerHub throttling and unpredictability.
- Lower storage/egress cost than GCR.
- Faster pulls via Cloudflare caching on a custom domain.

### Approach

- Run a standard OCI registry (e.g., `registry:2`) with S3-compatible storage.
- Use R2 as the registry storage backend (S3 API compatible).
- Put the registry behind Cloudflare on a custom hostname (e.g., `registry.cocalc.ai`).

### Storage config (registry)

- Configure `REGISTRY_STORAGE=s3` and point at R2 endpoint.
- Set bucket + access/secret keys for R2.
- Use a distinct prefix for registry objects (e.g., `oci/`).

### Access model

- For alpha: allow public pulls (read-only), push requires auth.
- For later: token auth (simple auth service) or Cloudflare Access.

### Usage in project-host

- Prefer pulling a prebuilt image from the registry.
  - Example: `podman pull registry.cocalc.ai/cocalc/file-server:0.6.5`
  - Then tag locally: `podman tag ... localhost/file-server:0.6.5`
- Keep current local build as a fallback if registry is unreachable.

### Rollout

- Build + push file-server image on release.
- Update bootstrap to try pull/tag first, then build if missing.
- Extend to other small base images as needed (project-runner, etc.).

## Rollout Plan

1) Implement software artifact publishing + download verification.
2) Add cloud-init bootstrap to fetch SEA from R2.
3) Keep SSH bootstrap as fallback for 1 day.
4) After cloud-init is stable, remove SSH bootstrap.
5) Implement rootfs distribution as a follow-up optimization.

