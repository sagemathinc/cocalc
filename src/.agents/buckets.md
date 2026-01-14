# Buckets

## TODO

- [ ] Cloning a project should preserve the backup region \(and bucket assignment\).
- [ ] Show the backup region clearly in project settings.
- [ ] Show the backup region clearly in the project flyout settings.
- [ ] Extend the end\-to\-end smoke test to include a backup/restore step.
- [ ] Implement full project deletion so backups are cleaned up appropriately.
- [ ] Order backup regions based on distance from user \(use Cloudflare location cookie\).
- [ ] Allow self\-hosted project hosts to select a backup region \(default to closest\).
- [ ] Move project between hosts \(even if host is offline\) via restore\-from\-backup.
- [ ] When turning off a host, ensure all projects are backed up; add a separate "force off" path. Surface host\-level backup status in the host admin page.
- [ ] Surface per\-project backup status in the project UI.
- [ ] Rewrite backup APIs to handle long\-running operations \(progress \+ timeouts\).
- [ ] On project start, if backup exists but local data is missing, restore from backup \(lambda hosts\).
- [ ] Improve backup browsing UX in file explorer \(prefetch tree, loading states\).
- [ ] Sharing files \(new share server\), but use bucket.
- [ ] update last\_edited for projects properly, so it is dependable for project moves

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

### \(mostly done\) Phase 2: Move project between hosts \(same region\)

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

### \(done\) Phase 3: Copy files between hosts

Notes:

- we want to allow more than one dst_project_id, since distributing content (e.g., a handout to all 100 students in a course) is a key use case, and we don't want to have create and delete the corresponding backup 100 times.  It's fine for the dst_path to be the same for all targets.

- the actual function we need to support is copyPathBetweenProjects in src/packages/conat/hub/api/projects.ts, in the case then when the dest project_id is on a different host:

```
  copyPathBetweenProjects: (opts: {
    src: { project_id: string; path: string | string[] };
    dest: { project_id: string; path: string };
    options?: CopyOptions;
  }) => Promise<void>;
```

There is no separate "safe mode"; honor `CopyOptions` (e.g., `errorOnExist`, `force`) and treat this like `cp -r` with snapshots as the safety net. For a single host it remains a reflink `cp`. For cross-host copies we only use the bucket/restore path (no direct host-to-host pull), so this works even when the destination host is offline.

**Phase 3 Detailed Plan (bucket-only, async/offline aware)**

1. **New entrypoint**
   - Add [src/packages/server/projects/copy.ts](./src/packages/server/projects/copy.ts).
   - Export `copyProjectFiles({ src_project_id, dests, src_path, dst_path, account_id, options })`.
   - `dests` is an array of `{ project_id, path }`; keep the single-dest call shape for compatibility.

2. **API wiring**
   - Update [src/packages/server/conat/api/projects.ts](./src/packages/server/conat/api/projects.ts) to call the new entrypoint.
   - Reuse `assertCollab` for source and each destination project.

3. **Validation & safety**
   - Allow global copies across regions (no backup-region restriction).
   - Normalize `src_path`/`dst_path` as project-relative; reject absolute paths or `..`.
   - For bucket-based copies, verify `src_path` exists in the chosen backup (using rustic `ls`) rather than hitting the source host.
   - If source project is running, stop it unless `options.force` (warn about possible inconsistency).
   - Note: `last_edited` is currently unreliable; for now always create a fresh backup for copy unless we add a deliberate override. Add a TODO to relax once `last_edited` is fixed.

4. **Create a copy snapshot (source)**
   - Trigger a backup and record the snapshot id.
   - Expose rustic tags in the wrapper and tag the snapshot with `purpose=copy` plus `{src_project_id, src_path}`.
   - If tags are delayed, temporarily use a distinct rustic host string for copy snapshots and document the tradeoffs.

5. **Persist pending copies (master DB)**
   - Add a `project_copies` table (or similar) keyed by `{src_project_id, src_path, dest_project_id, dest_path}`.
   - Store `snapshot_id`, `options`, `created_at`, `expires_at` (default +7 days), `status`, `last_error`, `last_attempt_at`.
   - New copy for the same tuple overwrites the old one (mark old as superseded/canceled).

6. **Apply copy on destination host (when online)**
   - Add an API to fetch pending copies for a project/host, and to mark success/failure.
   - On host startup and before project start, apply pending copies for that project:
     - `ensureVolume` on destination.
     - Restore into a temp dir inside the project subvolume (not a separate subvolume).
     - Atomically rename into place; respect `CopyOptions` (`errorOnExist`, `force`).

7. **Cleanup snapshot**
   - Track per-destination completion; delete the snapshot when all pending dests complete/cancel/expire.
   - Add `listPendingCopies`/`cancelPendingCopy` APIs; cancel updates ref counts and triggers cleanup if last.

8. **Progress + errors**
   - Use an explicit step callback for progress (no streaming channel yet); log all steps in `copy.ts`.
   - On failure, store `status=failed` with `last_error` and keep snapshot for inspection until TTL.

9. **Future optimization**
   - Support backup-only subpath to reduce size/time.
   - Allow reuse if `last_backup` is fresh *and* we have a reliable `last_edited` signal.

### \(wip\) Long\-running operations \(LRO\) spec \(draft\)

- **Goals**: async-first (no blocking RPC), durable state, low DB load, high-resolution progress via conat, works across hub/host/browser, supports arbitrary duration and retries.
- **Operation record (authoritative)**: `id`, `kind`, `scope` (type+id), `status`, `created_by`, `owner` (hub/host), `routing` (hub|host_id|none), `input` (small JSON), `result` (small JSON or ref), `error`, `progress_summary`, `attempt`, `heartbeat_at`, `created_at/started_at/finished_at/updated_at`, `expires_at`, `dedupe_key`, `parent_id` (optional).
- **State machine**: `queued -> running -> succeeded/failed/canceled/expired`. Stale heartbeat can move `running -> queued` (retry) or `running -> failed` (max attempts).
- **Storage split**: DB table `long_running_operations` stores summary; conat persistence holds high-frequency progress events plus latest summary snapshot. DB updates only on state transitions or every N seconds.
- **Subjects and routing**: use conat persist service `persist`, so subjects are `persist.project-<id>` / `persist.account-<id>` / `persist.host-<id>` / `persist.hub` and require no auth changes. Each op uses stream name `lro.<op_id>`; project scope already routes to host, so no alias subject is needed.
- **Progress events**: `{ts, phase, message, progress?, detail?, level?}`. `progress` can be percent or `(current,total,unit,weight)` for bootlog-style bars. Keep a ring buffer of last N events and a "latest summary" object for late subscribers.
- **API surface**: `create({kind, scope, input, routing, dedupe_key, ttl}) -> {op_id, status, subject}`; `get({op_id}) -> summary`; `list({scope, kind, status}) -> summaries`; `wait({op_id, timeout}) -> final or timeout`; `cancel({op_id}) -> status`; `retry({op_id})` optional.
- **Worker lease**: claim queued rows with `SKIP LOCKED`; set `running` + heartbeat; update progress; on finish update DB summary + final conat event.
- **Idempotency**: dedupe by `(scope, kind, dedupe_key)`; create returns existing active op unless `force`.
- **Retention**: TTL per op; DB keeps summary until expiration; conat ring can be shorter (hours/days).
- **Security**: read access by scope (project collab, host admin, account owner); write access only by owner; op_id opaque.
- **Bootlog reuse**: treat bootlog as an LRO instance and reuse its UI for backup/restore/copy/start.

### Phase 4: Cleanup / compatibility

- **No backward compatibility**:
  - treat layout v2 as the only supported format
  - new snapshots must include metadata; restore logic assumes it
- address issues with brokeness due to persist being temporarily not allowed until subvolume exists.

