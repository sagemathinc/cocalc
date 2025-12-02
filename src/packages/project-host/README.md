# CoCalc Project Host

`@cocalc/project-host` is the multi-project host that embeds the Lite core and layers in podman/btrfs/project services. It is the building block for “project runner” nodes that can serve many projects and optionally attach to a remote master.

_Current status: skeleton only._ It boots the Lite core to give us a runnable binary and will grow to manage projects, podman, btrfs, and ingress.

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
- Run locally with `pnpm --filter @cocalc/project-host app` (builds then starts Lite for now).
- CLI: `cocalc-project-host` will work after a build (uses the compiled dist).
- Functionality is minimal today; podman/btrfs/ingress/master-link wiring will be layered in next.
