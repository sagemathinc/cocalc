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
