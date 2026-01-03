# Software and RootFS Image Distribution Plan

This plan covers:
- Software artifacts (project-host + project SEA bundles).
- RootFS images for project containers (btrfs subvolumes).

## Goals
- Make bootstrapping reliable and fast across clouds.
- Avoid SSH polling for artifact delivery (cloud-init fetches artifacts).
- Keep artifacts public (no secrets), but verify integrity.
- Keep downloads fast via Cloudflare caching in front of R2.
- Allow incremental rollout (fallbacks kept while cloud-init matures).

## Software Artifacts (SEA) Distribution

### Artifact layout
- Use a single public R2 bucket for software artifacts.
- Key layout (versioned):
  - `software/project-host/<version>/cocalc-project-host-<version>-<arch>-<os>.tar.xz`
  - `software/project/<version>/cocalc-project-<version>-<arch>-<os>.tar.xz`
- Metadata per artifact:
  - `<artifact>.sha256` (sha256 + filename)
- Small "latest" manifests:
  - `software/project-host/latest.json`
  - `software/project/latest.json`
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

## Rollout Plan

1) Implement software artifact publishing + download verification.
2) Add cloud-init bootstrap to fetch SEA from R2.
3) Keep SSH bootstrap as fallback for 1 day.
4) After cloud-init is stable, remove SSH bootstrap.
5) Implement rootfs distribution as a follow-up optimization.
