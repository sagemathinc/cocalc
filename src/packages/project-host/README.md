# CoCalc Project Host

`@cocalc/project-host` is the multi-project host that embeds the Lite core and layers in podman/btrfs/project services. It is the building block for “project runner” nodes that can serve many projects and optionally attach to a remote master.

_Current status: minimal host._ It starts a local conat server, embeds file-server + project-runner, and exposes a tiny (insecure) HTTP API to start/stop/check status of projects sharing the same podman/btrfs instance.

This package deliberately **does not depend on @cocalc/server, @cocalc/hub, or @cocalc/database**. The file-server bootstrap is vendored locally for project-host; the central master will not run file-server.

## Role

- Reuses the lightweight version of "hub/server/database" implemented  in [../lite](../lite/README.md) as the control\-plane core.
- Adds local project execution via `@cocalc/project-runner`, file access via `@cocalc/file-server`, and ingress via `@cocalc/project-proxy`.
- Owns podman/btrfs lifecycle for per\-project subvolumes, quotas, snapshots, and migrations.
- Provides SSH ingress \(with sshpiperd\) and HTTP/WS proxying to running project containers.
- Designed to register with a remote master for auth/project placement but keep projects usable locally.

## Change Discipline

- Shared logic belongs in Lite. Keep project-host focused on container/btrfs/ingress concerns and host-level orchestration.
- Avoid duplicating hub/server features; extend Lite instead and consume from here.
- Keep dependencies narrow: podman, btrfs, project-runner, file-server, and project-proxy live here; frontend and heavy hub logic stay out.
- When adding host APIs, design them so compute servers and future “Plus” flows can reuse the same Lite surface without forks.

## Getting Started

- Build with `pnpm --filter @cocalc/project-host build`.
- Run locally with `pnpm --filter @cocalc/project-host app` (builds then starts the embedded file-server + runner).
- CLI: `cocalc-project-host` works after a build (uses the compiled dist).
- HTTP API (no auth yet):
  - `GET /healthz`
  - `GET /projects` (recently touched projects)
  - `GET /projects/:id/status`
  - `POST /projects/:id/start` (optional JSON body `{ config: ... }`)
  - `POST /projects/:id/stop` (optional JSON body `{ force: boolean }`)
- Functionality is intentionally minimal/insecure; podman/btrfs lifecycle, ingress, and master-link wiring will be layered in next.
