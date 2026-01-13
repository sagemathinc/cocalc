# Buckets

## TODO

- [ ] Cloning a project should preserve the backup region (and bucket assignment).
- [ ] Show the backup region clearly in project settings.
- [ ] Show the backup region clearly in the project flyout settings.
- [ ] Extend the end-to-end smoke test to include a backup/restore step.
- [ ] Implement full project deletion so backups are cleaned up appropriately.
- [ ] Order backup regions based on distance from user (use Cloudflare location cookie).
- [ ] Allow self-hosted project hosts to select a backup region (default to closest).
- [ ] Move project between hosts (even if host is offline) via restore-from-backup.
- [ ] When turning off a host, ensure all projects are backed up; add a separate "force off" path. Surface host-level backup status in the host admin page.
- [ ] Surface per-project backup status in the project UI.
- [ ] Rewrite backup APIs to handle long-running operations (progress + timeouts).
- [ ] On project start, if backup exists but local data is missing, restore from backup (lambda hosts).
- [ ] Improve backup browsing UX in file explorer (prefetch tree, loading states).
- [ ] Sharing files (new share server), but use bucket.

## Plan to implement full backup/restore and copy using rustic and buckets

### \(done\) Phase 1: Foundation \(layout \+ backup \+ restore\)

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

**Phase 2 Detailed Plan**

1. **\(done\) Define the new entrypoint**

- Create a new server module: [src/packages/server/projects/move.ts](./src/packages/server/projects/move.ts)
- Export a single function like `moveProjectToHost({ project_id, dest_host_id, account_id })` that does the orchestration.

2. **\(done\) Replace the old path**

- Locate the existing move flow in [src/packages/server/conat/api/projects.ts](./src/packages/server/conat/api/projects.ts) \(currently `requestMoveToHost`\).
- Replace the old call with the new function from [src/packages/server/projects/move.ts](./src/packages/server/projects/move.ts).

3. **\(done\) Auth and basic validation**

- In the conat API handler, keep `assertCollab` for project access.
- In `move.ts`, load:
  - Project record \(need `project_id`, `last_backup`, `last_edited`, current `host`/`project_host_id`, region\).
  - Destination host record \(need `id`, `status`, region\).
- Validate:
  - Destination host exists and is not deleted.
  - Project and host are in the same backup region \(using the project’s region mapping\).
  - Host is not deprovisioned and has a data disk.

4. **\(done\) Determine backup requirement**

- If the project is running: stop it first \(use existing `stopProject` in [src/packages/server/project\-host/control.ts](./src/packages/server/project-host/control.ts)\).
- If the project is not running:
  - Compare `last_edited` and `last_backup`.
  - If `last_backup` is missing or older than `last_edited`, mark “backup needed.”

5. **Trigger backup only if needed**

- Reuse the existing backup RPC path \(the same flow used in project\-host backup\).
- After backup completes, update `last_backup` via the hub RPC you already added.
- If backup is not needed, skip this step entirely.

6. **Move placement**

- Update the project’s host assignment to `dest_host_id` using the existing placement helper \(e.g., `savePlacement`\) in [src/packages/server/project\-host/control.ts](./src/packages/server/project-host/control.ts).
- This should update the project’s host record, not start anything yet.

7. **Start project on destination host**

- Call `startProjectOnHost` with `restore="auto"`.
- Do not send TOML proactively unless restore is truly needed \(let host fetch it if missing\).

8. **Basic logging \(no progress channel yet\)**

- Add structured logs in [src/packages/server/projects/move.ts](./src/packages/server/projects/move.ts) for each step:
  - stop, backup, placement update, start, restore.
- Keep logs only; do not add conat channels yet.

9. **Error handling**

- If stop fails: return error immediately.
- If backup fails: return error immediately; do not move host assignment.
- If start fails after placement update: log as a failure and bubble error.
- Ensure no “partial” move is silent.

10. **Smoke‑runner hook \(later\)**

- No changes in smoke‑runner in this phase, but keep the function signature clean so we can call it from tests later.

11. **Docs / TODO alignment**
12. another thing I just remembered \-\- we need to add a very clear warning in the move dialog that snapshots are NOT moved \(they get deleted\); only the backup history is preserved.

### Phase 3: Copy files between hosts

- create a temporary backup snapshot of a subpath (root `project/` limited to that subpath)
- restore into target project path
- optionally delete the temporary snapshot

### Phase 4: Cleanup / compatibility

- **No backward compatibility**:
  - treat layout v2 as the only supported format
  - new snapshots must include metadata; restore logic assumes it
- address issues with brokeness due to persist being temporarily not allowed until subvolume exists.

