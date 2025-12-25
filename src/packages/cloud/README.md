# @cocalc/cloud

This package provides a small, provider\-agnostic interface for provisioning and
controlling project\-host VMs in public clouds. It is intentionally narrow in
scope: create, start, stop, delete, resize, and query status for a VM that will
run a CoCalc project\-host. Everything else \(host registration, auth, billing,
UI, etc.\) lives in higher\-level packages.

## Purpose

The goal is to make cloud providers swappable. The interfaces here are
minimal and designed to be used by `@cocalc/server` when a user creates or
starts a host. Providers map a generic host spec \(CPU/RAM/disk/GPU/region\) to
their own VM offerings.

## What is here now

- A provider-agnostic interface (`CloudProvider`, `HostSpec`, `HostRuntime`).
- A minimal GCP adapter stub with basic instance creation/start/stop/delete
  logic that uses vendor images and a bootstrap script (via metadata).
- A Local provider that keeps an in-memory lifecycle state for dev/tests.
- Catalog discovery helpers (e.g., GCP regions/zones/machine types/GPUs) for
  building UI selectors and validating host specs.

## Planned additions

- A complete GCP adapter:
  - Persistent disk enlarge support.
  - DNS wiring via Cloudflare \(or other provider\) when configured.
  - Robust status mapping and error handling.
  - Usage tracking: how much did a VM cost
- Additional providers \(Hyperstack, etc.\) using the same interface.
- Optional "bootstrap helpers" to generate startup scripts that install
  podman, btrfs, and the project\-host bundle.

## Scope and design constraints

- **No custom image management**: use vendor-provided base images and bootstrap
  at first boot (cloud-init / startup scripts).
- **No bucket or storage management**: object storage configuration and mounts
  are handled elsewhere (project-host or user configuration).
- **No long-lived orchestration**: once a VM is created, ongoing host logic is
  handled by the project-host runtime itself.
- **Provider-specific complexity stays in adapters**: the rest of CoCalc should
  only depend on the interface in `types.ts`.

If you want to add a new provider, implement `CloudProvider` in a new module
and keep the adapter focused on VM lifecycle only.
