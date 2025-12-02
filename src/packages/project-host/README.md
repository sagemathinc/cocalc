# CoCalc Project Host

`@cocalc/project-host` is the multi-project host that embeds the Lite core and layers in podman/btrfs/project services. It is the building block for “project runner” nodes that can serve many projects and optionally attach to a remote master.

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
- This package is currently a scaffold; functionality will be layered in as podman/btrfs and master-link wiring are added.

