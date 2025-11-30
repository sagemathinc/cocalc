## cocalc architecture plan (project-proxy + combined runner/file-server)

- **Roles**  
  - Keep [file-server](./src/packages/file-server) as storage/Btrfs/source-of-truth code, now embedded/used inside project-runner.  
  - New [project-proxy](./src/packages/project-proxy) service handles SSH/HTTP/WebSocket ingress into projects.  
  - Each project-runner = scheduler + compute + storage + embedded file-server.

- **Extract proxy responsibilities into project-proxy**  
  - Move SSH bits from [src/packages/file-server/ssh](./src/packages/file-server/ssh) (sshpiperd, auth, routing) into project-proxy.  
  - Move HTTP/WebSocket forwarding from [src/packages/server/conat/file-server/index.ts](./src/packages/server/conat/file-server/index.ts) into project-proxy; keep storage APIs with file-server.  
  - project-proxy exposes “given projectId, open a bidirectional stream to its runner” (direct dial first version).

- **Routing/state: project → runner mapping**  
  - Extend current placement logic in [src/packages/conat/project/runner/load-balancer.ts](./src/packages/conat/project/runner/load-balancer.ts) to persist “project → runnerId”.  
  - Provide an API/Conat subject (e.g., in [src/packages/conat/project/runner/run.ts](./src/packages/conat/project/runner/run.ts)) for project-proxy to resolve `projectId → runner endpoint` (and transport type).  
  - Push updates on project move to proxy caches; add TTL/refresh to avoid stale routing.

- **Runner registration and health**  
  - Runner self-registers with control plane: announces ID, reachable address/port (direct) or tunnel handle (future hidden-runner).  
  - Keepalive/health feed so project-proxy can refuse/reroute when a runner is down.

- **Connector abstraction in project-proxy**  
  - Define connector interface (open/close stream, metrics). Implement adapters:  
    - direct TCP dial to runner (default in-cluster).  
    - reverse-tunnel placeholder (runner-initiated) for hidden/on-prem runners; stub behind feature flag.  
  - Long-lived connections: enforce keepalives/timeouts for SSH/WebSocket.

- **Project moves**  
  - Extend runner/scheduler to support “move project”: snapshot + `btrfs send/recv` + map update.  
  - Coordinate with project-proxy so new connections go to the new runner after cutover.

- **Config and deployment**  
  - New service (container/Helm) for project-proxy, fronted by LB with TLS; only this is public.  
  - Runners no longer need public ingress; accept traffic from proxy tier only.  
  - File-server code runs inside runner; deprecate assumptions of a central file-server subject.

- **Auth and policy**  
  - Reuse SSH cert/auth logic from [src/packages/file-server/ssh](./src/packages/file-server/ssh) in project-proxy; keep auth/authorization centralized in proxy.  
  - Add connection/byte rate limits per project in proxy to protect runners.

- **Observability and ops**  
  - project-proxy metrics/logs: per-project connection counts, latency, failures, tunnel status.  
  - Runner registration metrics: health, active connections, storage headroom.  
  - Alerts on stale project→runner mappings, failed dials, registration loss.
  - TODO: tighten project-proxy HTTP handler to enforce a base path/length before slicing project_id.

- **Rollout path**  
  - Phase 1: same-zone GCP, direct connector only; proxy extracts SSH/HTTP forwarding; runners embed file-server.  
  - Phase 2: add project-move workflow and persistent mapping store.  
  - Phase 3: add reverse-tunnel adapter for hidden/on-prem runners without touching proxy/routing core.
