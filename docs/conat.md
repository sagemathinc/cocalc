## Conat filesystem RPCs (sandbox)

- Frontends talk to the sandboxed filesystem over Conat using the `@cocalc/conat/files/fs` client. Each method is a request/response RPC to the backend `SandboxedFilesystem`.
- Paths are always sandbox-relative; the backend enforces safety via `safeAbsPath`.
- Common calls: `readFile`, `writeFile`, `writeFileDelta` (patch+etag helper), `watch` (proxied chokidar), and `syncFsWatch(path, active?)` to heartbeat or drop interest in a shared backend watcher.
- Watch streams use a Conat socket subject `watch-${service}`; the first `watch()` call stands up a server-side watch; subsequent calls reuse it.
- Errors propagate with codes (e.g., `ENOENT`, `ETAG_MISMATCH`, `PATCH_FAILED`) so callers can retry or fall back to full writes.
