## Goal

Bring Codex agents into CoCalc chat so threads can be backed by a live coding agent that can edit project files, run commands, and stream results—without compromising security or existing LLM plumbing.

NOTE:

- in chat ws: means "william stein" = the human.

## Constraints / Existing Pieces

- Chat UI (`packages/frontend/chat`) supports multiple “LLM threads” driven by `selectable_llms` coming from `/customize`.
- `@cocalc/ai/llm` + lite hub currently treat LLMs as stateless chat models. Codex needs a long-lived agent process tied to a project and user identity.
- Codex SDK (Rust/Bun) exposes agent lifecycle + event streaming. We’ll consume it via the official TypeScript SDK or wrap the CLI/Bun runtime.
- Authentication must support both site-wide API keys (admin configured) and per-user Codex logins (e.g., ChatGPT Pro accounts).
- Daemon must only access the target project directory and perhaps explicit extra mounts—no global `/opt/cocalc`.

## Proposed Architecture

1. **Codex Agent Service \(backend\)**
   - Live in `packages/ai/codex`and run inside the hub/lite hub.
   - Responsibilities:
     - Launch Codex agents via SDK given `{project_id, account_id, codex_credentials}`.
     - Bind\-mount only that project path \(and optional shared binaries\) into the agent sandbox.
       - For full cocalc, the agent will be started inside of a podman container
       - For packages/lite \(cocalc lite\) codex will just be running directly on the user's computer and we will use its own sandbox \(no bind mount\)
     - Stream events \(messages, tool output, file diffs\) over conat/WebSocket to the chat UI.
     - Restart and clean up agents; store agent state in SQLite/Postgres to resume conversations.
   - API surface \(conat service\):
     - `codex.startThread({thread_id, project_id, model, authContext}) -> session_id`
     - `codex.sendMessage({session_id, content}) -> stream`
     - `codex.stop({session_id})`
   - Store metadata in existing LLM history tables or a new `codex_threads` table.

2. **Auth & Credentials**
   - Extend lite/native admin settings to capture:
     - Default Codex API key \(global\) for site\-provided agent.
     - Optional OAuth login per user:
       - Add “Connect Codex” button in account settings \(`packages/frontend/account/lite-ai-settings.tsx`\).
       - Flow: redirect to Codex OAuth, receive tokens, store encrypted per account \(reuse secrets storage used for other provider tokens\).
   - When launching an agent, prefer user token; fall back to shared key if allowed.

3. **Agent Runtime**
   - Decide execution approach:
     - **Option A:** Run Codex SDK as a sidecar process inside the project container \(preferred for tool execution\). Project Runner would mount the Codex bundle \+ SDK.
     - **Option B:** Central service that maps project file operations via RPC. More complex; defer unless container integration is problematic.
       - ws: NO \-\- definitely go with Option A.
   - Provide a narrow API for Codex tool/channel:
     - `run_shell(command)` limited to the project sandbox.
     - `apply_patch` for files \(with server\-side validation\).
     - `read_file`, `write_file`, `list_dir`.
   - Map these to our existing project FS APIs so auditing and limits stay consistent.
     - ws: I don't think we need a narrow api, existing fs integration for **option A**. We just run the codex rust binary directly in the podman sandbox or on the user's compute \(for cocalc\-lite\). 

4. **Frontend Integration**
   - Chat thread creation dialog lists Codex models when `/customize` includes them.
   - When a Codex\-backed thread starts:
     - Chat store sends `conat.codex.startThread`.
     - Messages stream via `conat.codex.stream` channel; UI renders incremental updates and tool output \(similar to LLM streaming, but include structured cards for commands/diffs\).
   - Add explicit “Agent controls” \(stop/run command\) in the thread sidebar.
   - Reuse existing thread persistence so Codex chat logs show up alongside other providers.
   - ws: this sounds excellent!

5. **Settings / Customize**
   - Extend server settings schema with:
     - `codex_enabled`
     - `codex_default_models` \(array\)
     - `codex_allow_user_tokens`
   - `/customize` should include `selectable_llms` entries like `"codex-codex-gpt4"` and new flags for the frontend to show entry points.

## Implementation Steps

1. **Backend groundwork**
   - Vendor the Codex SDK \(check license, add to `packages/ai`\).
   - Create `@cocalc/ai/codex` API that wraps agent lifecycle with dependency injection similar to `llm`.

2. **Lite Hub Prototype**
   - Implement `packages/lite/hub/codex.ts` that:
     - Reads settings, exposes conat routes, stores sessions in SQLite.
     - Launches local Codex agent bound to the project path \(MVP: run SDK process in host namespace but chdir to project\).
       - ws: for lite it's really just "run on the host. full stop".  That's it.  This of cocalc\-lite as just like vscode running locally.  There's no separate projects, etc. 

3. **Frontend UI**
   - Add `CodexThread` metadata in chat store; update `packages/frontend/chat` to render Codex\-specific events \(e.g., command outputs\).
     - ws: metadata could just be in the first message of the codex thread
   - Extend account settings with “Connect Codex” OAuth stub and per\-provider API key fields.

4. **Security & Sandboxing**
   - Ensure agent commands go through the same project\-runner enforcement \(resource limits, allowed binaries\).
     - ws: automatic since codex will running in the project podman pod.
   - Audit file operations; log source IP/account for compliance.
     - ws: this will be nice to log and show to users

5. **Rollout**
   - Start with lite mode \(single\-user\) to validate flow.
     - ws: yes, this should be the top priority.  Also, once this exists I'll be able to switch to _using codex_ via this very thing to finish the development. 
   - Once stable, wire `@cocalc/server` to the same service so hosted CoCalc can offer Codex threads.

## Open Questions

- How to run the Codex SDK inside project containers \(Bun \+ required libs\) for both x86\_64 and ARM?
  - ws: we can ensure npm is available then do "npm i \-g @openai/codex".  Then we'll have "codex" as a cli command and can run it \(since we can run any code in the container\).  We can also assume containers have recent enough glibc, since that's already required by cocalc. 
- Per\-user login flow details: does Codex expose OAuth endpoints compatible with our existing strategy framework?
  - ws: I've tried this manually and the codex cli outputs a URL.  we would then redirect the users browser to open that url; the user then gets redirected back to something on localhost \-\- hopefully we can make it so that redirect is configurable, so we can then put the result back into the codex cli \(or api\).  Basically this is indeed an open question. Worst case, for cocalc\-lite, which just tell the user "install codex somehow and sign in; that's up to you".  For codex in a cocalc project, we really do have to solve this problem.
- Persistence: do we store Codex agent IDs long\-term, or recreate them per session and replay context?
  - ws: good question. It seems like codex is really good at storing sessions locally \(?\).. but maybe that is codex\-cli, and we have to replicate that functionality ourselves.  I'm worried, e.g., about how to do compactification of long threads, etc. I don't want to have to reproduce what codex already has implemented in codex\-cli.

## Next Actions

1. Prototype `@cocalc/ai/codex` wrapper that can:
   - Start an agent using an API key.
   - Send a message and stream response back to a test harness.
2. Define conat message schema for Codex threads.
3. Update customize/settings to advertise `codex_enabled` and surface initial models.

## Progress Snapshot (Nov 20)

- **SDK integration:** `@cocalc/ai/codex` now wraps the official TypeScript SDK with a CJS-safe dynamic import, and exposes `CodexThreadRunner` for `run`/`runStreamed`.
- **Conat bridge:** Added `packages/conat/codex/{types,server,client}.ts` with a dedicated subject (`codex.account-*.api`), streaming `ThreadEvent` payloads and final summaries.
- **Lite hub:** `packages/lite/hub/codex.ts` wires Codex into the lite conat server; streaming works end-to-end when the Codex CLI is logged in and env is set.
- **Runtime env fix:** lite launcher preserves host `HOME`/`PATH` (`HOST_HOME`, `HOST_PATH`); Codex runner can take `codexOptions.env` to find the user’s `~/.codex` and CLI path, preventing “Reconnecting…” auth errors.
- **Hello world confirmed:** From browser via `runCodex/streamCodex`, returns “Hello from Codex!” when HOME/PATH point to the logged-in Codex config.

## Next Steps (remaining)

- Surface Codex flags/models in `/customize` (site settings) so frontend lists Codex in selectable LLMs.
- Frontend chat integration: consume `streamCodex` events, render command/file-change items, finalize thread UX.
- Hosted mode: launch Codex inside project containers (podman), pass env/paths accordingly, and decide auth flow (user vs shared key).

## Upcoming UI work (lite chat)

- Add a Codex config modal + button in chat (e.g., `packages/frontend/chat/codex.tsx`):
  - Trigger when viewing a Codex thread with missing config, and via a persistent “Codex” button in the chat header; later, also on a leading `/`.
  - Fields: working directory (default to chat’s directory), optional session_id (reuse/continue), model selection, any CLI env overrides (HOME/PATH), and future options (sandbox/approval/network).
  - Store config in the first chat message metadata so subsequent loads can rehydrate the session.
  - Once config is present, send messages over the conat Codex route using that session, then iterate on event rendering.
