# Systematically getting cloud to robustly work

## State Reconciliation

Goal: keep `project_hosts.status` aligned with actual provider state, without
flapping or masking in-flight transitions. Treat the provider as the source of
truth for *runtime state* and the control plane as the source of truth for
*desired state*.

### State Model

- **Desired state**: last user action (start/stop/reprovision/delete).
- **Observed state**: provider VM state + data volume existence.
- **Off semantics**: VM may be absent, but the data volume exists.
- **Deprovisioned**: VM absent *and* data volume absent.

### Provider Mapping

Each provider maps its raw status to normalized:

- `running`, `starting`, `stopping`, `off`, `error`, `deleted/absent`

Additionally, we must query the **data volume** (where applicable) to decide
`off` vs `deprovisioned`.

### Reconciliation Loop

- Periodically poll hosts that are:
  - `starting`, `stopping`, `reprovisioning`, `error`, or stale `last_seen`
  - OR have missing `runtime.public_ip`
- For each host:
  - Fetch provider VM status (if VM exists).
  - Check data volume existence (if provider has persistent disk).
  - Update `metadata.runtime.provider_status` and `metadata.runtime.observed_at`.
  - Reconcile:
    - VM exists + running → `status=running`
    - VM absent + volume exists → `status=off`
    - VM absent + volume absent → `status=deprovisioned`
    - VM stopping/deleting → keep `status=stopping`
    - VM error → `status=error`
  - Clear stale `public_ip` if VM missing.

### Guardrails

- **Grace window**: don’t override `last_action` outcomes for N minutes
  after a state change to avoid fights with start/stop actions.
- **Unknown vs off**: a single failed API call should not flip state; require
  two consecutive confirmations for “missing”. 
- **Rate limits**: cap hosts per tick, exponential backoff per provider.
- **Hyperstack reserved volumes**: treat “reserved” as transitional, not failed.
- **DNS/Cloudflare lag**: avoid flipping to error solely for missing IP; allow
  DNS setup to proceed after `running`.

### UI Edge Cases

- Show both:
  - **Control\-plane status** \(e.g., “stopping”\)
  - **Provider observed status** \(e.g., “stopping/deleting”\)
- If a host is stale \(`last_seen` old\), show “stale” badge and encourage
  “Refresh state” or “Reconcile now”.
- Keep UI simple: if data disk exists, treat as `off`; only show `deprovisioned`
  when both VM and data volume are gone.
  - if the VM is deprovisioned but the data disk exists, we just show this as "off", not "deprovisioned".   There's no need to add complexity to the UI purely due to weirdness of cloud providers.  E.g., technically an off machine on GCP and an off machine on Hyperstack are basically identical \-\- it's some bytes on block devices; but GCP has an abstraction of an "instance" in that case, and hyperstack doesn't.  

### Implementation Plan

1. Add provider “status probe” functions \(VM status \+ volume existence\).
2. Add reconciliation job:
   - schedules periodically \(e.g., every 2–5 min\)
   - operates on subsets of hosts
3. Extend `runtime` metadata with `provider_status` \+ `observed_at`.
4. Add guardrails: grace window, missing confirmation, backoff.
5. Wire to UI: display observed status \+ stale indicator.
6. Use in smoke tests: run reconciliation after stop/start.

---

## \(done\) Issues Observed \(From Smoke Runs \+ Manual Checks\)

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

