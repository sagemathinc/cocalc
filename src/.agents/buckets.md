# Buckets

## TODO

- [ ] Cloning a project should preserve the backup region (and bucket assignment).
- [ ] Show the backup region clearly in project settings.
- [ ] Show the backup region clearly in the project flyout settings.
- [ ] Extend the end-to-end smoke test to include a backup/restore step.
- [ ] Implement full project deletion so backups are cleaned up appropriately.
- [ ] Order backup regions based on distance from user (use Cloudflare location cookie).
- [ ] Move project between hosts (even if host is offline) via restore-from-backup.
- [ ] When turning off a host, ensure all projects are backed up; add a separate "force off" path. Surface host-level backup status in the host admin page.
- [ ] Surface per-project backup status in the project UI.
- [ ] Rewrite backup APIs to handle long-running operations (progress + timeouts).
- [ ] On project start, if backup exists but local data is missing, restore from backup (lambda hosts).
- [ ] Improve backup browsing UX in file explorer (prefetch tree, loading states).
- [ ] Sharing files (new share server), but use bucket.

## Plan to implement full backup/restore and copy using rustic and buckets

### Phase 1: Foundation (layout + backup + restore)

- **\(done\) Rustic layout v2**: store data in a simple straightforward way
- **\(done\) Backup**
- **\(done\) Restore\-on\-missing**:
  - when starting a project, if local project root is missing, auto\-restore
  - restore `project/` root into project home
  - restore `persist/` root into the persist location
  - surface clear progress \+ failure in UI
- **\(done\) Backup freshness tracking**:
  - record last successful backup time
  - record last possible data change time \(project running, FS API, codex edits\)
  - if last\-change &gt; last\-backup, warn about potential data loss if skipping backup

### Phase 2: Move project between hosts (same region)

- force backup on source host (allow option to skip if source host unavailable; warn about potential data loss using freshness tracking)
- change project host_id to target
- target host starts project; restore-on-missing kicks in
- optional cleanup of local data on source host

**Detailed Implementation Plan: Move Project Between Hosts (Same Region)**

1. **UI entry point**
   - Reuse the existing “Move” UI but **region‑lock** host choices to the project’s backup region.
   - Only show hosts that are `running` and `online` by default.
   - If no eligible hosts, show a clear message and a “Force move using last backup” option.
   - **Optional \(later\)**: support cross‑region move as a slower path \(copy the per‑project rustic repo to a new bucket, then re‑point\). Keep UI biased toward staying in‑region.

2. **Hub orchestration**
   - Add a new hub action \(e.g. `projects.moveToHost`\) in [src/packages/server/conat/api/projects.ts](./src/packages/server/conat/api/projects.ts) or a new orchestration file \(e.g. `src/packages/server/projects/move.ts`\).
   - The hub owns the entire flow and emits progress.
   - **Progress channel**: bootlog can’t be used \(stored in project itself\). Add a **movelog** subject pattern in [src/packages/server/conat/socketio/auth.ts](./src/packages/server/conat/socketio/auth.ts) that:
     - allows collaborators of a project to read/write,
     - does **not** route to the project itself,
     - is used for move/restore progress and errors.
     - \(if this is unclear, skip until end \-\- it's not a blocker for everything else.\)

3. **State/locking**
   - Introduce a move lock \(either new fields on `projects` or a small `project_moves` table\).
   - Use a **DB‑level lock** \(PG advisory/row lock\) so multiple moves can’t overlap.
   - Ensure this also works with pglite \(avoid PG‑only constructs that break it\).

4. **Preflight checks**
   - Verify `project.region == targetHost.region`.
   - Require target host to be `running` and `online` unless `force` is set.
   - Use `last_backup` vs `last_edited`:
     - If `last_backup < last_edited`, `force` must be explicit.
     - This gives a concrete “potential data loss up to X minutes” warning.

5. **Backup step**
   - If the source host is reachable and `force` is **false**, request an immediate backup on the source host **only if** `last_backup < last_edited`.
   - If backup fails, abort the move.
   - If the source host is unreachable, allow `force` to skip this step with a warning that data may be missing.

6. **Freeze project writes**
   - Introduce a new **move‑locked** state that blocks:
     - FS writes,
     - Codex edits,
     - other project activity.
   - This prevents `last_edited` from advancing during the move.

7. **Start on target with restore directive**
   - Call `startProjectOnHost` with `restore: required`.
   - Include rustic TOML if needed.
   - Host should restore on missing and then start the project.

8. **Verification**
   - Verify by querying a sentinel file via file‑server RPC.
   - If verification fails, surface a clear error and keep the move lock \(for manual recovery\).

9. **Finalize**
   - On success:
     - update `project.host_id` to the target,
     - clear move lock,
     - emit “Move complete” in movelog,
     - schedule cleanup of the old host’s project subvolume.

10. **Failure handling**

   - If any step fails:
     - keep `project.host_id` unchanged,
     - store clear failure metadata,
     - allow “Resume move / Retry / Force move”.

**Progress & UX**

- Use **movelog** as the single progress channel \(“backup started”, “backup complete”, “restoring”, “verifying”\).
- If `force` is used, show an explicit warning: “Restoring from last backup; changes since last backup may be lost \(last edit at …\).
- ”

**Smoke‑runner extension**
Add a move‑between‑hosts step to [src/packages/server/cloud/smoke-runner/project-host.ts](./src/packages/server/cloud/smoke-runner/project-host.ts) and verify the sentinel survives.

If you want, I can paste this into the “Phase 2” section in [src/.agents/buckets.md](./src/.agents/buckets.md) for tracking.

### Phase 3: Copy files between hosts

- create a temporary backup snapshot of a subpath (root `project/` limited to that subpath)
- restore into target project path
- optionally delete the temporary snapshot

### Phase 4: Cleanup / compatibility

- **No backward compatibility**:
  - treat layout v2 as the only supported format
  - new snapshots must include metadata; restore logic assumes it
- address issues with brokeness due to persist being temporarily not allowed until subvolume exists.

