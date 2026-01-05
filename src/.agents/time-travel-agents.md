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
- opens  the doc and a timetravel frame showing a diff from one patchid to another

This could be supported by enhancing the function "  time\_travel\(opts: { path?: string; frame?: boolean }\): void {" in src/packages/frontend/frame\-editors/base\-editor/actions\-base.ts and also coming up with a new anchor tag notation, e.g., \#{something}=...

## Best-Effort Heuristics

- Treat `sed`, `rg`, `head`, `tail`, `cat`, etc. as reads; record PatchId.
- If Codex writes without a detected read, use latest head as base.
- If a file read is too large, skip and do not record PatchId (log warning).

These heuristics are adequate for user visibility and UX, but they are not
guaranteed to capture every edit.  This fact should be mentioned in the UI \(maybe a tooltip\). 

## Memory and Lifecycle Management

Use an LRU with TTL for:

- `path -> lastReadPatchId`
- `path -> syncdoc handle`

When entries expire, close syncdoc handles to avoid leak.

## Implementation Checklist

- [ ] Implement AgentTimeTravelRecorder in backend (ai/acp or lite hub).
- [ ] Only track files under HOME; ignore paths outside HOME (syncdoc limitation).
- [ ] Hook read-detection events -> syncdoc open -> PatchId record.
- [ ] Hook write-detection events -> compute diff -> commit patch with meta.
- [ ] Add LRU/TTL for lastReadPatchId and syncdoc handles (consider refcount/lease).
- [ ] Expose commit metadata in frontend TimeTravel view.
- [ ] Add deep-link support for specific patchid or patchid range (see notes on new anchor notation).
- [ ] Surface best-effort caveats in UI (tooltip or help text).
- [ ] Add tests for read->write correlation and commit metadata.
- [ ] Add debug logs (counts of tracked files, cache size, commit counts).

## Notes

If Codex \(or other agents\) eventually emit pre\-contents or diffs, we can replace
the read/write heuristics with exact data, but the overall architecture stays
the same. The main value is the Patchflow commit with metadata, not the exact
diffing mechanism.
