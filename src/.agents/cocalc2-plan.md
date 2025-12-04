## Checklist (near term)

- [ ] SEA binary for running project\-host:
  - [ ] include binaries
  - [ ] allow user to select where project is hosted for easier testing \(could be hidden dev feature\)

- [ ] Btrfs Snapshots
  - [ ] the \$HOME/.snapshots directory does not exist
  - [ ] creating snapshots fails with this error: "request \-\- no subscribers matching 'file\-server' \- callHub: subject='hub.account.d0bdabfd\-850e\-4c8d\-8510\-f6f1ecb9a5eb.api', name='projects.createSnapshot', code='503'"

- [ ] Harden auth: signed connect tokens; enforce project ACLs for start/stop/open; remove anonymous access paths in project\-host hub/conat services.
  - Issue short\-lived signed tokens \(project\_id \+ perms \+ exp\) from master when opening a project; browser uses them to open `wss://<host>/conat` directly. Hosts validate tokens locally.

- [ ] Runner networking: keep non\-host networking but guarantee containers can reach the host conat endpoint; consider explicit hostfwd mode if we ever bind conat to loopback only.

- [ ] File/quotas/backups UX: default quota \+ snapshot/backup counts on project create; expose image/pull errors cleanly; add image allowlist \(e.g., ubuntu:25.10\) and fallback behavior.

- [ ] Cross\-host data motion: copy/move between hosts \(rsync \+ btrfs send/recv\), GC source after validation, update project→host map, and surface progress/errors to users.

- [ ] Rustic/GCS backup pipeline with retention tags per project/host; per\-host health checks.

- [ ] Observability: per\-host metrics/logs, minimal status page \(runner/file\-server/conat\), project lifecycle spans; alerts for failed moves/backups and low headroom.

- [ ] Proxy ingress: project\-proxy base\-path TODO; SSH/HTTP ingress for hidden/on\-prem hosts; keep optional but available.

- [ ] Compute/plus alignment: treat compute servers as user\-scoped project\-hosts with reflect\-sync subset sharing; API for spinning up temporary hosts; drop project\_id column from compute\_servers in favor of host auth/ACL.

- [ ] Fallback File\-server that doesn't require btrfs \(no snapshots or quotas\).  This would make it possible to support running the entire project\-host purely in userspace \(with podman\) on both Linux and MacOS.

## CoCalc New Architecture Plan (federated project-hosts + proxy)

- **Roles**  
  - Master: central API/auth/placement; holds project→host map; issues signed connect tokens; optional proxy fallback.  
  - Project-host: self-contained runner/file-server stack (podman + Btrfs + conat + tiny sqlite cache); no user creation or global changes; serves multiple projects.  
  - Project-proxy: separate service for SSH/HTTP/WebSocket ingress when direct host access isn’t possible.

- **Control-plane contracts**  
  - Host registration/keepalive to master (ID, region, public URL/tunnel handle, health, capacity).  
  - Placement APIs: assign/move project; master returns signed user tokens + host URL.  
  - Auth cache on host with push/TTL invalidation from master; hosts can serve with cached ACLs for a bounded TTL if master is slow/unreachable.

- **Data-plane routing**  
  - Preferred: user → project-host directly with a signed token (project, user, expiry, host) over a dedicated conat socket per host (master socket stays separate).  
  - Fallback: user → project-proxy → host using the same token validation.  
  - Routing lookup lives in master; host identity via per-host cert/keys. Keep proxy optional but available for restrictive networks.

- **Compute servers (recast as project-hosts)**  
  - Compute servers become user-owned project-hosts (powerful VMs, often GPU). No `project_id` column; access controlled by host ACL.  
  - Users sync/copy data between projects (reflect-sync/btrfs send) instead of remote-mounting a project FS.  
  - Must support userspace-only deployments (podman) for HPC/on-prem; registration + auth is the same as any host.

- **Service extraction/refactors**  
  - Keep [file-server](./packages/file-server) embedded in project-host; remove “central file-server” assumptions in [packages/server/conat/file-server/index.ts](./packages/server/conat/file-server/index.ts).  
  - Extract SSH/HTTP proxy pieces into [packages/project-proxy](./packages/project-proxy) (move code from [packages/file-server/ssh](./packages/file-server/ssh) and relevant parts of [packages/server/conat/file-server/index.ts](./packages/server/conat/file-server/index.ts)).  
  - Add host-local conat instance per host; master uses conat only for control-plane topics.

- **Project moves and storage**  
  - Moves: snapshot + `btrfs send/recv` between hosts; update project→host map; optional delta/cutover; validate and clean source.  Also move all persist sqlite stores!
  - Backups: per-host Btrfs snapshots + rustic to object storage; tag snapshots/backups with project IDs for audit/GC.  Also backup all persist sqlite stores.
  - PD/Btrfs as primary; optional SSD cache layer later.

- **Hidden/on-prem hosts**  
  - Connector abstraction: direct TCP in-cluster; reverse tunnel (SSH/WireGuard/QUIC) for hidden hosts; project-proxy aware of transport.  
  - Host bootstrap includes master URL/credentials; hidden hosts register via reverse channel but otherwise share the same APIs.

- **Security/auth**  
  - Signed user tokens validated on host and proxy; hosts cannot mint users/projects.  
  - Rate limits per project/host; audit logs for token and ACL decisions.

- **Observability and ops**  
  - Metrics: host health, auth cache hit/miss, master latency, project count, disk/headroom, backup freshness, move success.  
  - Alerts: stale project→host map, failed host dial, token validation failures, low headroom.  
  - Runbooks: add host, move project, rotate keys, restore, handle master outage policy.

- **TODOs carried forward**
  - Tighten project-proxy HTTP handler to enforce a base path/length before slicing project_id.

- **Rollout steps**  
  1) (done) Embed file-server in project-host; add host registration + project→host map in master.  
  2) Implement signed connect tokens and direct user→host path; keep proxy fallback.  
  3) Implement project move workflow (btrfs send/recv) and backup tagging.  
  4) Pilot a small pool in one zone; test offline/TTL behavior, direct vs proxy, moves/backups; add observability.  
  5) Add reverse-tunnel connector for hidden/on-prem hosts without changing routing core.

## Diagram

Mermaid sketch of master + project-host federation:

```mermaid
flowchart LR
  subgraph Master["Master CoCalc Service"]
    MAPI["API / Auth / Placement"]
    MConat["Conat (control plane)"]
    Routing["Project→Host map"]
    Proxy["(Optional) Project-Proxy"]
  end

  subgraph HostA["Project-Host A (self-contained)"]
    AConat["Conat (projects)"]
    ASQLite["Local SQLite cache"]
    ARunner["Podman/Btrfs + file-server"]
    AuthA["Auth cache (tokens/ACL)"]
  end

  subgraph HostB["Project-Host B (self-contained)"]
    BConat["Conat (projects)"]
    BSQLite["Local SQLite cache"]
    BRunner["Podman/Btrfs + file-server"]
    AuthB["Auth cache (tokens/ACL)"]
  end

  User["User"]

  %% Control plane
  User -->|Open project request| MAPI
  MAPI -->|Signed token + host URL| User
  MAPI <--> MConat
  MConat <--> AConat
  MConat <--> BConat
  Routing <--> MAPI

  %% Data plane (preferred direct)
  User -->|Direct WS/HTTP+token| AConat
  AConat --> ARunner
  AConat --> AuthA

  %% Data plane (fallback via master proxy)
  User -->|WS/HTTP| Proxy --> AConat

  %% Mobility/backup (illustrative)
  ARunner <-. btrfs send/recv .-> BRunner
  ARunner <-. rustic (GCS/S3) .-> BRunner

  %% Host bootstrap
  MAPI -->|Placement/assign| ARunner
  MAPI -->|Placement/assign| BRunner
```

## Details to not forget

- memory quota: i think that was set on the pod; I don't see it being set now at all
- set the container hostname
- looking up the project is async but the subject routing is sync, so it will fail the first time in src/packages/server/conat/route\-project.ts; this MUST get fixed or everything will be broken/flakie at first.  Solution is make some options to conat/core/client be a promise optionally and delay the connection.
- need to rewrite everything in the frontend involving the project runner directly; in particular, see src/packages/frontend/projects/actions.ts
  - cloning projects
  - moving projects
- need to ensure any backend code that uses projects no longer users runners \(e.g., supporting api\)
- There are api calls/functions for things like "execute code on project" \-\- these will need to send a message to the relevant project\-host and back.
- Project activity \-\- when project is being used, etc. \-\- needs to get updated regularly from the project host to master.
- Right now project\-hosts allow users to directly create projects on them, which should not be allowed.  Even worse, user can specify the project\_id, which is a major security issues.  See src/packages/project\-host/hub/projects.ts
- When setting a project we always add the default cocalc\-lite account so we can keep things working: "      // [ ] TODO \-\- for now we always included the default user; this is obviously temporary"
- Any backend/api stuff has to be updated to use the same conat routing functionality... or maybe we just use a proxy.
- #security: src/packages/server/conat/route\-client.ts currently gives away the master hosts secret auth to any project\-host, which of course isn't good.
- eliminate this: src/packages/conat/project/runner/load\-balancer.ts
- eliminate /src/packages/project\-proxy/container.ts, in process rewriting /src/packages/project\-proxy/proxy.ts to take a function to get port as input

## Completed

  - [x] ssh to project
    - [x] load ssh keys on project creation \(showing that authorized\_keys column works\)
    - [x] write .ssh/.cocalc/sshd/authorized\_keys from sshpiperd config
    - [x] get sshpiperd to auth properly and observer manually that ssh works
    - [x] update ssh on project\-host when they change in master and when project starts
  - [x] Jupyter \-\- attempting to start shows this error "Error: syncdb's ipywidgets\_state must be defined!"
- [x] Bind project\-host HTTP/conat on 0.0.0.0 \(temporary\); document firewall expectations. Keep a note to revisit Unix\-socket bind \+ container mount for tighter scope.

- [x] Master control\-plane: host registration/keepalive, project→host map, placement API; surface placement decisions in UI and hub API.

- [x] Connect to projects via per\-host websocket \(no iframe\).
  - Use separate conat sockets per host in the frontend; master socket remains for hub/db.
  - Add a master proxy fallback \(`/project-host/<id>/conat` → upstream\) and auto\-failover if direct connect fails; reuse a single socket per host and multiplex multiple projects on it.
- [x] Uploading and downloading images and files over http; used e.g., for the latex editor to look at the pages.   This is a feature of the web server, which is fully implemented in packages/hub/ and certainly in packages/lite, and probably is easy to just enable, hopefully.  The files are read/written streamed over conat.
- [x] Similar issue \-\- proxying of http to the project doesn't work yet, e.g., so can run jupyterlab, vscode, etc.  Need to look up project's host and proxy that way.
- [x] Built project-proxy service and moved SSH/HTTP forwarding out of file-server.
- [x] Created project-host: local conat server + persist, embedded file-server, runner, sqlite + changefeeds, frontend (static + customize + redirect), and hub API wiring for project create/start/stop. Terminals and file browsing now work end-to-end.
- [x] Removed sidecar/reflect-sync path; runner now directly launches single podman container with Btrfs mounts.
- [x] Vendored file-server bootstrap into project-host with Btrfs/rustic/quotas; added fs.* conat service and SSH proxy integration.
- [x] Moved SEA/bundle logic from lite to plus and from runner to project-host; excluded build output from tsc; removed old REST `/projects` endpoints and added catch-all redirect.

