# Systematically getting cloud smoke tests to robustly pass on all supported clouds

## Issues Observed (From Smoke Runs + Manual Checks)

- **Data disk re\-formatted on reprovision**: editing a stopped host and starting can wipe `/btrfs` \(Nebius repro shows empty project dir, root\-owned, no snapshots\). Suspect bootstrap is re\-running `mkfs` because sentinel is missing on a reattached disk.
- **Project subvolume ownership**: after reprovision, project dir is owned by root and `.snapshots` creation fails. Likely a consequence of disk reformat, but guard should still ensure correct ownership.
- **sshpiperd install failure on first boot**: project\-host may fail to start on first boot even though sshpiperd exists in `/opt/cocalc/tools/current`. Should prefer tools path before install.
- **Host heartbeat/status drift**: if project\-host daemon dies, control plane still shows stale “running” until a manual refresh. Need periodic heartbeat with staleness detection.
- **Cloud transitional state drift**: UI often shows “off” or “deprovisioned” while provider still stopping/starting. Need periodic reconciliation against provider APIs.
- **Hyperstack stop/start race**: after stop \+ update, start fails with “host status became error”, likely because the VM or disk isn’t fully detached before start.
  - this is because the VM still exists.  It's the "**Cloud transitional state drift" above.**
- **DNS propagation race**: project host can be reachable, but local DNS caches NXDOMAIN, causing startProject timeouts. \(Not a smoke failure anymore, but still a real UX issue.\)
  - how to solve this? I think we need careful gating \- make sure a browser doesn't try until dns is setup?  don't return the host\_id until we successfully setup dns and don't remove the dns entry should do it.

## Todo List (Ordered)

1. **Nebius reprovision disk safety**: detect existing btrfs filesystem and skip `mkfs` when a data disk is already formatted (even if sentinel is missing).
2. **Project subvolume ownership guard**: ensure `/btrfs/project-<id>` and `.snapshots` are owned by ssh user before use.
3. **sshpiperd install path**: always prefer `/opt/cocalc/tools/current/sshpiperd` on first boot; avoid “install” failure.
4. **Heartbeat + staleness**: add periodic project-host status update to control plane; mark host stale/offline if `last_seen` is too old.
5. **Provider reconciliation loop**: periodically reconcile cloud provider state with `project_hosts.status` to fix drift.
6. **Hyperstack stop/start gating**: ensure stop fully completes before reprovision/start (wait for provider state and disk visibility).
7. **DNS race mitigation**: retry on initial failures or delay project start until DNS is resolvable.

## Current Focus

- **Nebius reprovision disk safety**: stop `mkfs` on already-formatted data disks and preserve `/btrfs` across reprovision/start.

