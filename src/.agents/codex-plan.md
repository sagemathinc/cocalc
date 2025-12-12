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



### Issues with the new pub/sub agent output

- [ ] it breaks ALL non-agent ai evaluations, since they try to subscribe
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
