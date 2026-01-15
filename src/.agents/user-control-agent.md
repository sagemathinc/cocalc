# User Control Agent Plan (MVP)

## Goals

- Provide a dashboard-level "Ask CoCalc" chat using the existing chat UI, but with hub-backed persistence.
- Use OpenAI Agents SDK (TS) for orchestration inside the hub and keep all control-plane actions explicit.
- Add write-capable actions with confirmations required for destructive or costly operations.
- Keep auditability, idempotency, and handoff to workspace agents from day one.
- Support both full CoCalc hub (Postgres) and CoCalc+Plus hub (lite), using adapters.

## Non-goals (MVP)

- No direct filesystem access or project execution from this agent without an explicit handoff.
- No long-running move/backup workflows beyond a stub.
- No complex scheduling or billing changes beyond confirmation gating.

## Environment targets

- **Full CoCalc hub:** multi-user, multi-workspace, Postgres-backed control plane.
- **CoCalc+Plus hub:** single-user, single-workspace, local app-like environment (no collaborators).

## Minimal Vertical Slice (touch each area)

- **Agent runner:** In-hub agent loop with a single control agent using OpenAI Agents SDK.
- **Tool surface:** Adapter-driven tools; full hub gets workspace/collab tools, lite hub gets config/logs/editor/sync tools.
- **UI actions:** Client-side allowlisted navigation actions (open workspace, switch to projects list, highlight UI).
- **Safety:** Dry-run responses and confirm tokens for destructive/costly actions.
- **Persistence:** Store chat threads in hub persistence, not workspace storage.
- **Handoff:** One tool to open a workspace-scoped agent session for in-workspace tasks.
- **Audit:** Record tool calls, parameters, result, and confirm token usage.

## Tool surface matrix (MVP)

| Area          | Full CoCalc hub                    | CoCalc+Plus hub                    |
| ------------- | ---------------------------------- | ---------------------------------- |
| Workspaces    | list/create/rename/archive         | not applicable                     |
| Collaborators | add/remove/change role             | not applicable                     |
| Organization  | tags/pins                          | not applicable                     |
| Logs          | read/search hub logs               | read/search local logs             |
| Config        | read/update account/org settings   | read/update local config           |
| Editors       | list supported editors             | list supported editors             |
| Remote sync   | configure sync to remote workspace | configure sync to remote workspace |
| Handoff       | open workspace agent               | open workspace agent               |

## Handoff pattern example (filesystem or code execution)

User intent: "Clone repo X, create a `codex.chat`, and open it."

1. Control agent validates context and selects the target workspace (or asks).
2. Control agent calls `handoff_to_workspace_agent` with:
   - target workspace id
   - brief task summary (clone repo, create file, open it)
   - optional parameters (repo URL, target path)
3. Workspace agent performs filesystem actions and reports back.
4. Control agent posts the result in the control-plane chat and links to the opened file or workspace view.

## Plan

1. **Define core interfaces and adapters**
   - Define an adapter interface for auth context, persistence, tools, and audit logging.
   - Implement lite and full adapters with consistent tool signatures and errors.
2. **Define tool contracts and permissions**
   - Draft TypeScript interfaces for control-plane tools with `request_id` for idempotency.
   - Assign permission scopes (read, write, destructive, billing).
   - Add `requires_confirmation`, `confirm_token`, and `dry_run` to tool outputs.
3. **Implement hub tool handlers (minimal set)**
   - **Full hub:** `workspace.list`, `workspace.create`, `workspace.rename`, `workspace.archive`
   - **Full hub:** `workspace.add_collaborator`, `workspace.remove_collaborator`
   - **Full hub:** `workspace.tag` (or `workspace.pin`) to cover basic organization
   - **Lite hub:** `logs.search`, `config.get`, `config.set`, `editors.list`, `sync.configure`
   - Stubs for destructive/costly actions (e.g., delete workspace, start host) that return confirmation requirements.
4. **Agent runner inside the hub**
   - Add a control agent with instructions, tools, and a `maxTurns` cap.
   - Inject account/org context and membership limits into every run.
   - Persist run metadata and tool results for audit and debugging.
5. **Chat integration using existing UI**
   - Reuse `src/packages/frontend/chat/` UI with a new "control-plane" thread type.
   - Back this thread with hub persistence (not workspace storage).
   - Add streaming updates for tool calls and confirmations.
6. **Client action proxy (allowlisted UI actions)**
   - Implement a `ui_action` tool that requests client-side navigation.
   - Allowlist actions: open workspace, switch panel/tab, highlight UI element.
   - Return a client acknowledgement to the agent for logging.
7. **Confirmation flow**
   - When a tool needs confirmation, return the plan + confirm token.
   - UI shows a clear confirmation step before re-invoking the tool with the token.
8. **Handoff to workspace agents**
   - Add a `handoff_to_workspace_agent` tool that opens ACP for a chosen workspace.
   - Include a brief summary and context payload.
9. **Minimal tests and telemetry**
   - Unit tests for permission gating, confirm tokens, and idempotency keys.
   - Log and trace all tool calls (who, what, params, result).
   
## To NOT forget

- [ ] we're using in-memory persistence now, but need something durable
