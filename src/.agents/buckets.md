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
- **\(todo\) Restore\-on\-missing**:
  - when starting a project, if local project root is missing, auto\-restore
  - restore `project/` root into project home
  - restore `persist/` root into the persist location
  - surface clear progress \+ failure in UI
- **\(todo\) Backup freshness tracking**:
  - record last successful backup time
  - record last possible data change time \(project running, FS API, codex edits\)
  - if last\-change &gt; last\-backup, warn about potential data loss if skipping backup

### Phase 2: Move project between hosts (same region)

- force backup on source host (allow option to skip if source host unavailable; warn about potential data loss using freshness tracking)
- change project host_id to target
- target host starts project; restore-on-missing kicks in
- optional cleanup of local data on source host

### Phase 3: Copy files between hosts

- create a temporary backup snapshot of a subpath (root `project/` limited to that subpath)
- restore into target project path
- optionally delete the temporary snapshot

### Phase 4: Cleanup / compatibility

- **No backward compatibility**:
  - treat layout v2 as the only supported format
  - new snapshots must include metadata; restore logic assumes it

