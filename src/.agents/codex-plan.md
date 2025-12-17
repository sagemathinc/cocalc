## Bring Codex integration to Multiuser Mode

**Goal:** support Codex/ACP in podman (multiuser) mode with a single ACP coordinator per project-host, routing every tool call into the correct project container. Frontend API should remain the same except for picking a project-scoped conat subject.

To not forget:

- [ ] when making a new codex session, no session id gets assigned at all, so the session is lost whenever we restart.

- [ ] also just had a problem where the mode on the codex side was "read only" but in the cocalc UI it was "full access".  This was in cocalc-plus mode, and the message to start the session was:
```
2025-12-17T15:30:26.602Z (77924):cocalc:debug:lite:hub:acp evaluate: start {
  reqId: '6dff39a7-b4d4-4ab7-8d8d-480e61fb3d89',
  session_id: '019b1b1a-3c68-7340-ac59-eb38beb294a9',
  chat: {
    project_id: '00000000-1000-4000-8000-000000000000',
    path: 'build/cocalc-lite/a.chat',
    sender_id: 'codex-agent',
    message_date: '2025-12-17T15:30:26.578Z',
    reply_to: '2025-12-14T04:23:53.485Z'
  },  projectId: '00000000-1000-4000-8000-000000000000',
  config: {
    workingDirectory: 'build/cocalc-lite',    model: 'gpt-5.1-codex-max',
    reasoning: 'medium',
    sessionMode: 'full-access',
    allowWrite: true,
    sessionId: '019b1b1a-3c68-7340-ac59-eb38beb294a9'
  },
  sessionMode: 'full-access',
  workspaceRoot: '/home/wstein/build/cocalc-lite'
}
```
but it was totally broken, and using `codex resume` in the terminal showed it had read only mode.

- [ ] submitting a new turn while one is running returns this error "{seq: 0, error: 'Error: ACP agent is already processing a request', type: 'error'}".  Thus turns are not queued up properly; basically make 2\-3 requests and all but the first stays stuck forever.
  - Frontend is I think doing the right thing.
  - Backend is NOT updating the syncdb document properly at all.

- [ ] if the codex-acp subprocess is killed then everything is broken forever; instead it should get restarted

- [ ] interrupt often doesn't work: with this error in frontend console.log "failed to interrupt codex turn ConatError: request \-\- no subscribers matching 'acp.account\-d0bdabfd\-850e\-4c8d\-8510\-f6f1ecb9a5eb.interrupt'"

- [ ] in lite mode nothing but "full access" works. They might -- this is just a test.
   - "sandbox/readonly in lite hangs; prompt.start with no end; likely codex-acp failure (no stderr surfaced)"

- [ ] change what sandbox option in container mode means (as configured in frontend/chat), i.e., when 'lite' is true, where `import {lite} from @cocalc/frontend/lite`. see other tasks below. The codex internal sandbox mode doesn't make any sense, but having a sandbox mode does.

- [ ] limit agent to only be able to write inside the workspace by mounting only a subset of the project's directory writable and the rest readonly, when doing sandboxExec. This is the key needed for sandbox mode.  Also handle fs calls differently.

- [ ] implemented readonly container mode by mounting the sandboxExec container fs readonly

- [ ] mounts created via src/packages/project-runner/run/sandbox-exec.ts do not get freed, which would lead to resource leakage.   The overlayfs mount *is* shared with the project if it is running, so this is subtle.  We only want to unmount if we actually make the mount and the project or another container didn't similarly start using it.  I.e., we need reference counting for the mount/unmount command.

- [ ] this might not be good from a security point of view "      // Pass through select env vars (OpenAI/Anthropic) to the container.
      const passthroughKeys = Object.keys(process.env).filter((k) =>
        /^(OPENAI_|ANTHROPIC_)/.test(k),
      );"  because these keys will be visible right there in "ps -ax". Better to write to a file in the container somehow...?
      
#### Done

- [x] ensure multiple concurrent sessions can run at once.  I have evidence they don't, and the solution would be spinning up a pool: [http://localhost:7000/projects/00000000\-1000\-4000\-8000\-000000000000/files/build/cocalc\-lite/a.chat\#chat=1765836152408](http://localhost:7000/projects/00000000-1000-4000-8000-000000000000/files/build/cocalc-lite/a.chat#chat=1765836152408)

- [x] our whole approach may be doomed: "Creating minimal Julia notebook
  I'm creating a minimal .ipynb file named demo.ipynb with basic cells and Julia kernel metadata, using JSON content written via cat &gt;. and then it does this: "~/scratch/btrfs2/mnt/0/project\-7f8daff5\-720d\-40e1\-8689\-1d2572a42811 \$ cat &lt;&lt;'EOF' &gt; /home/wstein/scratch/btrfs2/mnt/0/project\-7f8daff5\-720d\-40e1\-8689\-1d2572a42811/julia\_demo.ipynb ..."
  - note the path; maybe this is just a doomed idea and we should give up.

  - we did a bunch, but path rewriting for user display is still pretty broken: ![](http://localhost:7000/blobs/paste-0.10530121993630592?uuid=8235dc88-1a6e-44fc-be12-78a784e1931c)



### Detailed plan

1) **Carve out a shared ACP hub core**
   - Extract coordinator logic from [src/packages/lite/hub/acp/index.ts](./src/packages/lite/hub/acp/index.ts) into a reusable `hub-core` with a pluggable `Executor`.
   - `Executor` should mirror the behaviors in [src/packages/ai/acp/codex.ts](./src/packages/ai/acp/codex.ts): file read/write with per-turn snapshots, terminal lifecycle (`start/data/exit` with chunking/truncation), approval delivery, and usage streaming. Keep snapshot clearing per turn (see `fileSnapshots.clear()` in `setStream`) in the core so it stays consistent across executors.

2) **Implement executors**
   - **Lite executor (existing):** local fs + local processes; keep current behavior.
   - **Container executor (new):** build atop project conat APIs in [src/packages/conat/project](./src/packages/conat/project):
     - Files: use `readTextFileFromProject` / `writeTextFileToProject` (or a small `applyPatchToProject`) so all file IO is project-scoped and sandboxed.
     - Commands: prefer `exec` in [src/packages/conat/project/api/system.ts](./src/packages/conat/project/api/system.ts) (bash with timeout, cwd/env passed through). If we need true pty streaming, fall back to the terminal API in [src/packages/conat/project/terminal](./src/packages/conat/project/terminal) (start → data → exit, then close).
     - Preserve terminal/file semantics from codex.ts: chunking/truncation (`MAX_TERMINAL_STREAM_CHARS`), start/data/exit events, and per-turn file snapshots for diffs.
     - Reject cross-project paths; normalize `workspaceRoot` (container path) to prevent breakout; full-access only at first.

3) **Conat routing**
   - Add `acp.project.<project_id>` subjects served by project-host; enforce project membership/role before dispatch.
   - Frontend: pick the project subject; otherwise unchanged. Approval subjects remain per-account; project-host forwards to the right ACP session.

4) **Session wiring**
   - On session start, pass `project_id`, `workspaceRoot` (container path), execution mode, and env/cwd to the executor.
   - Ensure terminal/file events emitted by the executor match current formatting so `codex-activity` rendering stays unchanged (diffs come from file snapshots; terminals honor exit statuses/truncation).

5) **Persistence & replay**
   - Keep SQLite/AKV persistence as today (queued payloads + manifests). On host restart, replay queued payloads before live streaming.
   - Add integration smoke tests: two projects concurrently, container restart/replay, file diff + terminal output + approvals in podman mode.

6) **Security & rollout**
   - Feature flag in project-host; require membership on subjects and sandbox paths in the container executor.
   - Clear errors for unsupported modes (sandbox/read-only) and for approval timeouts (`APPROVAL_TIMEOUT_MS` in codex.ts).

7) **Frontend verification**
   - Verify approvals/thinking/terminal/file diffs still render; confirm multiple summary chunks are concatenated (fixed in ChatStreamWriter).
   - Run smoke flow in a podman project: read/write file, run command, observe terminal + diff, resume session after reload.

## Code Quality improvements to chat -- immer

Here’s a concise plan to finish the Immer migration and clean up chat code quality:

- **Single source of truth**: Stop storing a second copy of chat data in Redux. Consume the ImmerDB data directly (or via lightweight selectors) so we don’t double-memory or normalize twice. Phase out `messages: fromJS(...)` in the chat store once components can read plain objects.

- **Remove Immutable.js usage in chat**: Replace `Map/List/fromJS/toJS` in `chat/actions.ts`, `chat/store.ts`, `chat/message.tsx`, `chat/chatroom.tsx`, `chat/utils.ts` with plain JS/Immer-friendly structures. Add small helpers/selectors for common computed state (thread lookup, unread counts) to avoid reimplementing Immutable semantics.

Currently broken by this:

- [ ] editing messages doesn't work
- [ ] ai output appears in the wrong message.
- [ ] clicking thumbs up button doesn't work

- **Typed Immer everywhere**: Tighten types so `syncdb` is `ImmerDB` only (already started), and add proper TypeScript defs for `webapp_client.conat_client.conat().sync.immer` so we can drop `any` casts (e.g., in `chat/register.ts`).

- **Normalization/versioning**: Keep `normalizeChatMessage` minimal and non-mutating. Add a `schema_version` guard and an upgrader that runs once per message in sync init; skip writebacks on change handlers. Consider a lightweight per-message “validated” flag to avoid re-normalizing hot paths.

- **Component refactors**: Split `chat/message.tsx` into smaller pieces (header/meta, body, logs/thinking, controls) so logic is isolated and easier to test. Move ACP/log display into its own component with clear props. Do similarly for input-related UI (mentions, toolbar) to shrink `input.tsx`.

- **Memoized selectors**: Introduce memoized helpers (e.g., `getThreadMessages`, `getUnreadCount`, `getLastActivityAt`) over plain arrays/maps to replace ad-hoc filtering/sorting each render. Keep them pure and typed.

- **Tests**: Add unit tests for normalization and selectors using plain JS fixtures (no Immutable). Add a minimal render test for input with drafts to catch regressions like the @-mention crash. If possible, add a playback test that feeds change events into `handleSyncDBChange` and asserts store state.

- **Side effects & events**: Audit all `syncdb.on("change")` handlers to ensure they assume plain objects, and remove any lingering `.get()` or `.toJS()` calls. Ensure we don’t write back inside change handlers except for explicit migrations.

- **Cleanup legacy paths**: Remove or gate any remaining code paths that reference `SyncDB` in chat, and delete unused Immutable utilities once components are migrated.

These steps will finish the Immer switch, reduce RAM overhead, and make the chat codebase easier to maintain and test.

Bonus:

- make history more efficient using diff-match-patch and a version bump.

## Major Bugs and Issues

- [x] The read-file-from-disk content doubling bug is still there. NOT fixed by recent change.  This file: http://localhost:7000/projects/00000000-1000-4000-8000-000000000000/files/build/cocalc-lite/src/packages/sync/editor/generic/sync-doc.ts#line=2037
got doubled.

### Issues with the new pub/sub agent output

- [ ] it partly breaks ALL non-agent ai evaluations, since they try to subscribe
      but those don't use pub/sub
- [ ] first few messages are missed. Client should start listener before submit, not after some messages already sent
- [ ] provide api to get everything not sent with a sequence number so refreshed browsers work.

### Diffs

They are unusable and very buggy. rethink and rewrite completely.

### (done) Thinking/acp updates

(Seems not true) The biggest problem by far and top priority is that NONE of the thinking/progress updates actually appear anymore until the very end of the turn.  They *all* do 
appear right when the turn ends.  They simply aren't committed before that though.
Basically there is one big commit to the sync-doc right at the end.
This bug started very recently after the entire realtime sync implementation
got mostly rewritten, using a new library we wrote called Patchflow
(see https://github.com/sagemathinc/patchflow and the directory patchflow right here).   The codex/acp integration didn't change during the last week, so something about how the API of syncdoc's work (see src/packages/sync/generic/sync-doc.ts) 
did change, which broke things.  Probably we need to make an explicit
call to commit() where we didn't before.

Second, these thinking logs are very interesting right when they happen, but
they are huge.  I don't actually want to store them longterm at all.  It would 
be much better to refactor the code and store the logs separately from the
actual chat document, and make it easy to discard the logs. That's the real
problem to solve.  However, if there is a quick fix to at least commit the logs
while they are being generated, that would be very nice, since otherwise it's
quite hard to work on anything at all.   

Thoughts?  Can you look into this?

### (done) Bug: first message in chatrooms blanked.

first message in chatrooms keeps getting blanked.  weird bug. 

## Other less clear/critical bugs/issues

### Chat

Do not render older messages that you've already seen unless you explicitly click a "load more" button.  Otherwise chat can have 1000 messages in a thread and be overwhelming.

### Terminal UI

It's hard to read and see still.  Not very friendly.  Should use the user's color scheme, don't scroll overflow.

### Bug with multiple chunks of final output

If there are multiple chunks in the final agent response, only the very last is actually displayed.  I have an image showing this.

### Session config display

the session config is displayed incorrectly until you click on it -- wrong model at least. Any rerender (e.g., toggling panels) causes this.

### Markdown UI

Get rid of Copy/Run/Kernel at the top of each triple backtick code block in slate.  It's annoying.  Better UI possible?

### Update Codex-acp and codex-cli

codex-cli has  had many releases in the last 1-2 weeks, and we have a fork of it. Is there any hope we can merge?

### Make Codex Agent integration work with full cocalc with podman containers, not just with cocalc-lite

---

# Old stuff below

## Goal

Bring Codex agents into CoCalc chat so users can open a thread, point it at a workspace, and let a fully capable agent edit files, run commands, and stream results safely.

## Architecture snapshot (Nov 25)

- **AI layer** (`packages/ai/acp`): wraps our forked `codex-acp`/`codex-core`. Tools (terminal, read/write, apply patch) are implemented via ACP so every operation round-trips through CoCalc code (lite hub today, podman later).
- **Frontend** (`packages/frontend/chat`): contains Codex configuration modal (working dir, session id, model, reasoning, env overrides, execution mode). Context meter turns red <30 %. Threads call `webapp_client.conat_client.streamAcp()`.
- **Lite hub backend** (`packages/lite/hub/acp.ts`): launches ACP jobs, streams events, and writes them straight into the chat SyncDB via `ChatStreamWriter`. Payloads are throttled/saved and mirrored into SQLite so restarts replay missed events.
- **Conat bridge** (`packages/conat/ai/acp/{types,server,client}.ts`): defines `runAcp`, `streamAcp`, and approval subjects. Approvals are now explicit: frontend buttons post to `SUBJECT.account.approval`, backend forwards decisions to Codex.
- **Codex binaries**: custom fork adds tool delegation, `--session-persist`, and native-shell gateway. Lite uses local codex CLI (with sandbox for terminal); full CoCalc will run it inside podman.

## What works now

- Codex threads appear as chat conversations; output/events render via `codex-activity.tsx` with reasoning cards, terminal chunks, and file diffs (diffs generated from saved file snapshots).
- Session persistence: per-thread `sessionId` stored so dialog shows current ID, hub resumes sessions with persisted manifests (`acp_queue`+`codex_sessions`).
- Image handling: pasted blobs get downloaded to `/tmp/cocalc-blobs/<hash>.<ext>` and agents receive direct paths even without network access.
- Execution modes: UI offers Full access / Sandboxed / Read-only; sandboxed runs native codex CLI sandbox for terminals plus our own approval gate for shell escalation and network access.
- Lite security: commands run in user’s environment, but filesystem reads/writes still flow through ACP so we log and diff everything.

## Next priorities

1. **Activity UX**
   - Add elapsed time counter, stop button confirmation, tab activity indicator, and combine repeated “Thinking” fragments before saving.
   - Render command cards with consistent bullet layout and clickable file links (markdown `[foo.py](./foo.py)`).
2. **Session management**
   - Implement “fork session” (copy persisted Codex manifest + chat metadata) so users can branch work.
   - After browser refresh, replay queued payloads before subscribing to live stream; flush SQLite queue when acknowledged.
3. **Moderation & sandbox**
   - Expand approval UI to show reason + log entry; enforce automatic timeout (e.g., 8 h) that cancels pending tool calls.
   - For hosted CoCalc, run codex CLI inside the project podman container and pass in mounted bundles/binaries.
4. **Media & exports**
   - Generalize blob helper (images, PDFs) and auto-clean old temp files.
   - Add markdown export (full vs compact), with option to include/exclude “thinking”.
5. **Distribution & auth**
   - Produce codex-acp releases via CI (linux x86_64 first, `upx` shrink). Document install path for both lite and podman images.
   - Investigate Codex OAuth flow: hook into CLI-provided login URL, capture callback, inject tokens for hosted projects. For lite, rely on user-managed login for now.

## Outstanding tasks (from checklist)

- Disallow editing AI output; guard video-chat button in agent threads.
- Clear composer immediately on send; ensure “Thinking…” banner reflects backend state.
- Auto-highlight context meter (done) and show per-turn elapsed time (todo).
- Add markdown export UI with compact option.
- Build codex-acp binaries and installation script.

## Reference files

- Backend streaming: `packages/lite/hub/acp.ts`, `packages/ai/acp/*`.
- Frontend chat: `packages/frontend/chat/{actions,acp-api,codex,codex-activity}.tsx`.
- Flyout activity renderer: `packages/frontend/project/page/flyouts/*` (now support dimming extensions).
- Settings UI: `packages/frontend/account/lite-ai-settings.tsx`, `/customize` logic in `packages/lite/hub/settings.ts`.

Keep this summary handy when switching workspaces so the next session can pick up Codex integration without re-reading history.

