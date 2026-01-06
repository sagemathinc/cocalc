# Agent TimeTravel Integration (Design)

This document proposes a best\-effort design that records Codex file edits into
Patchflow so TimeTravel can show agent\-attributed history with links back to the
chat thread that triggered the edit. The design favors low memory overhead,
robustness across turns/sessions, and no changes to upstream Codex tooling.

## Goals

We want Codex-driven file edits to show up as regular Patchflow commits with
agent attribution and traceability to the originating chat thread. The system
should be resilient when Codex reads in one turn and writes in another, and it
should avoid caching entire file contents in memory.

- Record Codex edits as Patchflow commits.
- Attribute commits to an "agent" identity.
- Link each commit to the chat thread/session that triggered it.
- Avoid storing full file contents in memory.
- Work even when Codex reads in one turn and writes in another.

## Non-goals (for now)

This design does not aim for perfect coverage when Codex writes without any
read, nor does it aim for a full audit log of Codex's internal reasoning. It is
best-effort; correctness is prioritized, then coverage.

## Multi-agent / ACP tradeoffs

We plan to support multiple agent backends (Codex, Claude Code, Gemini CLI,
OpenCode, etc.), some via ACP and some via CLI exec/json. This changes the
tradeoffs and argues strongly for an adapter layer rather than agent-specific
logic in the recorder.

- ACP\-capable agents may emit structured events \(read/write/diff\) that are more
  reliable than CLI heuristics. When available, the recorder should prefer those
  events over command parsing.
- CLI\-only agents usually surface command execution and coarse file\-change
  events. For these, the "read \-&gt; PatchId \-&gt; write \-&gt; diff" heuristic remains
  best\-effort but is good enough for UX.
- Forking upstream agents to add diff/pre\-content is expensive and fragile; a hard requirement is to NOT fork. Use adapters to normalize events from multiple
  sources instead.
- Convergence goal: a single `AgentEventAdapter` interface that yields
  { read\(path\), write\(path\), command\(cmd\), file_change\(path, kind, maybeDiff\) }
  regardless of agent backend. This lets the recorder stay stable even as we
  add new agents.

## Constraints and Observations

Codex exec outputs events such as file changes and command executions, but it
does not emit a unified diff. We already have heuristics for "read" commands,
but they are not guaranteed to catch every read or write.

Patchflow supports commit metadata and PatchId strings. We can attach chat
thread/session metadata to patch commits for UI linking.

## Proposed Architecture

### 1) AgentTimeTravelRecorder (backend)

Introduce a small backend service that listens to Codex exec events and drives
Patchflow commits:

- Inputs: Codex exec event stream, project_id, workspace root, thread/session
  info.
- Outputs: Patchflow commits with metadata linking to the chat turn.

### 2) Read tracking: "last read patch id"

When Codex reads a file, we open the corresponding syncdoc (if not already
open), then record the current PatchId as the "last read" version for that path.

- We keep only PatchId and a syncdoc handle \(no file content\).
- Store in an LRU/TTL map keyed by absolute path.
  - syncdoc can only work with files whose path is relative to the HOME directory; so if codex reads/writes a file outside HOME, we ignore it
- If a file is read again, update the PatchId.
- This src/packages/util/refcount/lease.ts could be very useful for managing a pool of syncdoc's, which could get used across several codex turns, to minimize churn or other problems.

### 3) Write handling: compute patch from PatchId

When Codex writes a file:

- If we have a recorded PatchId for the path, compute the doc value at that
  PatchId, read the current file from disk, compute a diff, and commit that
  patch to Patchflow.
- If we have no recorded PatchId, fall back to the current head (best effort).
- If we still cannot resolve a base value, emit a "changed" event but skip
  creating a patch.

### 4) Commit metadata for traceability

Attach metadata to each agent commit so TimeTravel can link back to the chat
thread:

```
meta: {
  source: "agent",
  agent_session_id,
  chat_thread_root_date,
  chat_message_date,
  chat_path,
  log_store,
  log_key,
  log_subject,
}
```

This allows the frontend to show “Agent commit” and provide a link back to the
chat thread and/or activity log.

### 5) Agent attribution

Use a reserved agent userId or an explicit meta field for attribution. Since
PatchId now includes clientId, the userId is no longer the uniqueness key; it is
for display/analytics only. This avoids collisions and keeps attribution clear.

user: I do agree that the explicit meta field technically is sufficient for attribution. The userid doesn't really matter \-\- we should just whatever we use for chat.

## Data Flow (Happy Path)

1. Codex reads `foo.ts` \-&gt; record PatchId for `foo.ts`.
2. Codex writes `foo.ts` \-&gt; compute diff from PatchId \-&gt; commit patch with meta.
3. TimeTravel sees commit with `source: agent` and links to chat thread.
4. Chat thread \(codex activity log\) also has extra metadata to link to TimeTravel

NOTE: Deep linking to timetravel isn't implemented, i.e., there should be an anchor tag for any document that when clicked

- opens the doc and a timetravel frame at a particular patchid
- opens the doc and a timetravel frame showing a diff from one patchid to another

This could be supported by enhancing the function " time_travel\(opts: { path?: string; frame?: boolean }\): void {" in src/packages/frontend/frame\-editors/base\-editor/actions\-base.ts and also coming up with a new anchor tag notation, e.g., \#{something}=...

## Best-Effort Heuristics

- Treat `sed`, `rg`, `head`, `tail`, `cat`, etc. as reads; record PatchId.
- If Codex writes without a detected read, use latest head as base.
- If a file read is too large, skip and do not record PatchId (log warning).

These heuristics are adequate for user visibility and UX, but they are not
guaranteed to capture every edit. This fact should be mentioned in the UI \(maybe a tooltip\).

## Memory and Lifecycle Management

Use an LRU with TTL for:

- `path -> lastReadPatchId`
- `path -> syncdoc handle`

When entries expire, close syncdoc handles to avoid leak.

## Implementation Checklist

- [x] \(see plan below\) Implement AgentTimeTravelRecorder in backend
  - see detailed plan below in the section "Plan to Implement AgentTimeTravelRecorder"
- [x] Only track files under HOME; ignore paths outside HOME \(syncdoc limitation\).
- [x] Hook read\-detection events \-&gt; syncdoc open \-&gt; PatchId record.
- [x] Hook write\-detection events \-&gt; compute diff \-&gt; commit patch with meta.
- [ ] Introduce AgentEventAdapter interface for ACP vs exec backends.
- [ ] Add LRU/TTL for lastReadPatchId and syncdoc handles \(consider refcount/lease\).
- [ ] Expose commit metadata in frontend TimeTravel view.
- [ ] Add deep\-link support for specific patchid or patchid range \(see notes on new anchor notation\).
- [ ] Surface best\-effort caveats in UI \(tooltip or help text\).
- [x] Add tests for read\-&gt;write correlation and commit metadata.
- [ ] Add debug logs \(counts of tracked files, cache size, commit counts\).

## Notes

If Codex \(or other agents\) eventually emit pre\-contents or diffs, we can replace
the read/write heuristics with exact data, but the overall architecture stays
the same. The main value is the Patchflow commit with metadata, not the exact
diffing mechanism.

---

## Plan to Implement AgentTimeTravelRecorder

Here’s a concrete, step‑by‑step plan (no code) for implementing the AgentTimeTravelRecorder in [src/packages/ai/sync/agent-sync-recorder.ts](./src/packages/ai/sync/agent-sync-recorder.ts). I’ve baked in your constraints: reuse the existing AKV, skip/record cases where metadata can’t be attached yet, and log those skips.

**Plan: AgentTimeTravelRecorder (backend)**

- **Define purpose + boundaries (docstring at top of class)**
  - Record best‑effort agent→patchflow linkage without retaining file contents in RAM.
  - Persist lightweight “last known patchId” per file in AKV.
  - Skip annotations when a file is already open/committed and metadata mutation doesn’t exist yet; log.

- **Choose AKV namespace**
  - Reuse the existing ACP log AKV store (same DB), new key prefix to avoid collision.
  - Key scheme (example): `agent-tt:<threadId>:file:<path>` → `{ patchId, atMs, lastReadTurnId }`.
  - Also store per-turn “touched files” if needed: `agent-tt:<threadId>:turn:<turnId>` → `{ files: [...] }`.

- **Recorder class surface (backend)**
  - `constructor({ project_id, path, threadId, logStore, logKey, logSubject, logger, syncFactory })`
  - `recordRead(filePath, patchId, turnId)` → store patchId in AKV.
  - `recordWrite(filePath, turnId)` → attempt to compute agent commit; if blocked, log.
  - `finalizeTurn(turnId)` → flush any pending writes; log skipped files.
  - Keep no file contents in memory; only store patchId + metadata.

- **Integration points**
  - Hook into codex-exec event handling in the ACP hub (on “read_file” and “file_change”/write events).
  - When codex exec reports a read, call `recordRead`.
  - When codex exec reports a write, call `recordWrite`.
  - On turn end, call `finalizeTurn`.

- **How `recordWrite` should work (best effort)**
  - Open a syncdoc for the file in “no filesystem watcher” mode (important to avoid auto-commit).
  - Load state (snapshot-based) to get current patch id.
  - If we have a cached patchId from `recordRead`, compute diff between that state and current disk, then commit with metadata.
  - If the file is already open by frontend and already committed: **skip** and **log** “skip: already committed; metadata mutation not available”.
  - If no prior read patchId: either skip or use current patchId (best effort) to commit; prefer logging skip unless `allowWriteWithoutRead` is true.

- **Metadata payload**
  - Attach metadata on the new patch commit:
    - `agent: { threadId, rootDate, turnId, messageDate, model, sessionId }`
    - `source: "codex-exec"`
    - `filePath`
  - Ensure this metadata schema is centralized (e.g., helper in [src/packages/ai/sync/agent-sync-recorder.ts](./src/packages/ai/sync/agent-sync-recorder.ts)).

- **Logging**
  - Log on:
    - Read cached patchId.
    - Write commit success with patchId.
    - Skip (file open / no cached read / syncdoc init fail).
  - Include filePath, threadId, turnId.

- **Testing (unit/integration)**
  - Unit test recorder logic with a mocked syncdoc + akv store:
    - `recordRead` persists patchId.
    - `recordWrite` creates commit when patchId is present.
    - `recordWrite` logs skip when “already committed”.
  - Optional integration test with a small patchflow-backed file to verify metadata in patch.

- **Deferred work**
  - Metadata mutation support in patchflow sync layer (so we can backfill metadata for already-committed patches).

**Checklist (implementation order)**

- [x] Create [src/packages/ai/sync/agent-sync-recorder.ts](./src/packages/ai/sync/agent-sync-recorder.ts) skeleton + docstring.
- [x] Define AKV key prefix + helpers.
- [x] Implement `recordRead`, `recordWrite`, `finalizeTurn` with logging and skip behavior.
- [x] Wire into ACP/codex turn processing in the backend.
- [x] Add unit tests for recorder.
