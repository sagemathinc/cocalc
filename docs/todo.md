# Documentation TODO

Short list of docs we still need to write so someone can understand and operate the new architecture end to end:

- [ ] Security & Trust: threat model, trusted vs untrusted project-hosts, ssh key distribution, conat permissions, token lifetimes, forced commands, data at rest/in transit.
- [ ] Deployment & Ops: how to bootstrap a hub + project-host cluster, required services (Postgres, object storage), sample configs/env vars, building and publishing images/SEAs, upgrade steps.
- [ ] Project Lifecycle Flows: create/start/stop/move/archive/restore story with state transitions, what persists where (overlayfs uppers, persist stores, snapshots, backups).
- [ ] Routing & Placement: how projects are assigned to hosts, cache/TTL + LISTEN/NOTIFY, failover/retry behavior, what happens after a move.
- [ ] Quotas & Limits: how disk quotas are applied/updated (btrfs qgroups), default quotas on project create, how usage is calculated and surfaced in the UI.
- [ ] Backup UX: user-facing flow for creating/restoring backups, scheduling, limits/retention, what “restore” overwrites vs restores elsewhere.
- [ ] Move Edge Cases: resumability, cleanup of partial moves, handling host restarts during move, staged-vs-pipe guidance and when to fall back.
- [ ] Observability & Runbooks: key logs/metrics to watch on hub/project-host, common failures (btrfs, rustic, sshpiperd), manual recovery steps.
- [ ] Testing & Migration: smoke tests for moves/backups, fixtures, and guidance for migrating existing projects into the new architecture.
