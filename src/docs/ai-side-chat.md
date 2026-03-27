# AI Side Chat

This document describes the current AI assistant architecture in CoCalc's
frame editors.

## Scope

There are two related but different AI surfaces:

- **Embedded side assistant** inside the existing chat frame for supported
  editors
- **`.app` agent editor**, which is a separate editor type and not part of
  the regular side chat

This document focuses primarily on the embedded side assistant and then
summarizes how the `.app` editor differs.

## Entry Point

The assistant lives inside the normal side chat frame.

High-level flow:

```text
projectActions.open_chat({ path, chat_mode: "assistant" })
  -> generic/chat.tsx
  -> segmented [Assistant | Chat] control
  -> regular chat or embedded agent component
```

The frame-level mode is stored in `desc.get("chat_mode")` and written back
via `set_frame_tree`, so the selected tab is collaborative and persists.

Main file:

- `src/packages/frontend/frame-editors/generic/chat.tsx`

Important behavior:

- The assistant tab is only shown when the file has an embedded agent and AI
  is enabled for the project.
- If AI is disabled but the frame was persisted in assistant mode, the chat
  frame shows a warning with a **Switch to Chat** action instead of mounting
  the agent.
- The embedded agent does not mount until the side-chat SyncDB is ready.

## Supported Files

Embedded-agent eligibility is centralized in:

- `src/packages/frontend/frame-editors/generic/agent-registry.ts`

Rules:

- `.ipynb` uses the **Notebook Agent**
- code-like file types use the **Coding Agent**

The coding-agent side is intentionally based on frontend file associations,
not a hard-coded extension list. In practice this covers:

- CodeMirror-based editors
- LaTeX editors
- code-like text formats with a defined mode in `file_associations`

Examples include:

- `py`, `r`, `R`, `jl`, `c`, `cpp`
- `tex`, `rmd`, `qmd`, `md`, `html`
- no-extension code-like files such as `Dockerfile` and `Makefile`

Extension checks are case-insensitive.

## Shared Agent Model

The embedded Coding Agent and Notebook Agent share several common building
blocks:

- session/turn management through `useAgentSession`
- shared session bar and rename modal
- shared message rendering
- shared debounced cost estimation
- shared bounded-history logic before sending to the model
- shared hint-mode / read-only routing

Common files:

- `src/packages/frontend/frame-editors/llm/agent-base/*`
- `src/packages/frontend/frame-editors/llm/history-budget.ts`

## Turns / Sessions

Each assistant conversation is organized into **turns**.

UI:

- `+ New` starts a fresh turn
- the dropdown switches between stored turns
- turns can be renamed
- `Done` is a manual turn boundary in the embedded agents

Storage:

- turns are stored in SyncDB records keyed by `session_id`
- embedded agents use the side-chat SyncDB and filter by agent event name
- standalone agent views use hidden meta files when applicable

Turn cap:

- stored turns are capped at **100**
- the oldest sessions are pruned first
- the currently active turn is protected from pruning

Relevant file:

- `src/packages/frontend/frame-editors/llm/agent-base/use-agent-session.ts`

## Coding Agent

Main file:

- `src/packages/frontend/frame-editors/llm/coding-agent.tsx`

Prompt/input model:

- the system prompt is rebuilt on every send
- it includes current editor context around cursor/selection/viewport
- for large content, only a bounded context window is included
- prior history is compacted and then bounded by the selected model's input
  token budget

Capabilities:

- line-based `<<<EDIT ... >>>` blocks for file edits
- `<<<SHOW ... >>>` blocks to request more file context
- fenced ` ```exec ` blocks for shell commands

Important current behavior:

- edit application is fail-safe; prose-only answers do not trigger destructive
  whole-file replacement
- pending edits are shown separately and can be auto-applied or manually
  applied
- exec blocks require explicit confirmation
- LaTeX-specific prompting reminds the model to preserve balanced
  `\begin/\end`, delimiters, and environments

Display behavior:

- assistant edit blocks are rendered as compact ` ```diff ` blocks
- user/system context blocks are also visually compacted so prompt context
  reads as supporting material, not primary assistant output

## Notebook Agent

Main file:

- `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent.tsx`

Utilities:

- `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.ts`

Prompt/input model:

- the system prompt is rebuilt on every send from current notebook context
- focused-cell context is bounded to a line window around cursor/selection
- large selections and tool results are truncated before reuse
- prior history is compacted and bounded to the selected model's token budget

Tool model:

- `cell_count`
- `get_cell`
- `get_cells`
- `set_cell`
- `edit_cell`
- `insert_cells`
- `run_cell`

Important current behavior:

- `set_cell` replaces the entire cell input
- `run_cell` runs the current cell contents, including freshly written edits
- after a successful mutating tool batch, the follow-up prompt tells the model
  to summarize and stop instead of re-reading and second-guessing its own edit
- tool results shown to the user keep full detail; compacted tool results are
  only used for model history

Display behavior:

- `set_cell` and `edit_cell` tool results include visible diff previews
- `get_cell` / `get_cells` blocks are shown in the same compact code-block
  style as diffs

## Help Me Fix / Get a Hint

The existing `HelpMeFix` entry point is shared across editors:

- `src/packages/frontend/frame-editors/llm/help-me-fix.tsx`

Routing behavior:

- if a file supports an embedded agent, `Help me fix` opens the assistant side
  chat and seeds a new turn
- otherwise it falls back to the older modal flow

Mode behavior:

- **Fix this problem** uses the normal embedded agent
- **Get a hint** uses read-only hint mode

Hint mode is enforced in two ways:

- the prompt only exposes read operations
- runtime parsing filters or ignores mutating actions anyway

Notebook hint mode exposes only:

- `cell_count`
- `get_cell`
- `get_cells`

Coding-agent hint mode exposes read-only context requests but not edit or exec
instructions.

## LaTeX Build-Failure Flow

LaTeX `Help me fix` is richer than generic code help:

- clicking gutter or Problems-panel help opens the embedded assistant
- the seeded turn includes parsed error context plus bounded tails of relevant
  build logs
- no full-document dump is included in the seeded user message anymore; the
  coding agent already has current editor context and `SHOW` support

Relevant files:

- `src/packages/frontend/frame-editors/latex-editor/actions.ts`
- `src/packages/frontend/frame-editors/latex-editor/gutters.tsx`
- `src/packages/frontend/frame-editors/latex-editor/errors-and-warnings.tsx`

## AI Restrictions in Student Projects

Project AI gating comes from project settings:

- `disableChatGPT`: all AI disabled
- `disableSomeChatGPT`: partial AI only

Behavior:

- full AI disabled: embedded assistants are unavailable
- partial AI: embedded assistants are still openable, but run in read-only
  explanatory mode using an allowed tag such as `explain`
- `.app` editor is blocked when AI is fully disabled or partial-only

Relevant files:

- `src/packages/frontend/projects/store.ts`
- `src/packages/frontend/frame-editors/generic/chat.tsx`
- `src/packages/frontend/frame-editors/llm/coding-agent.tsx`
- `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent.tsx`
- `src/packages/frontend/frame-editors/agent-editor/*`

## `.app` Agent Editor

The `.app` editor is related but separate from the side chat.

Main file:

- `src/packages/frontend/frame-editors/agent-editor/agent-panel.tsx`

Behavior:

- natural-language app-building agent on the left
- preview/runtime panel on the right
- supports file writes, search/replace, exec, and server-mode switching
- has its own bounded history and cost estimation
- trust is required before preview execution

This surface is not routed through `generic/chat.tsx`.

## Current Limitations

- there is still no conversation caching between model calls
- `Done` remains a manual turn boundary
- agent output quality remains model-dependent
- history pruning is bounded, but long-running conversations can still vary in
  usefulness depending on model behavior

## Main Files

- `src/packages/frontend/frame-editors/generic/chat.tsx`
- `src/packages/frontend/frame-editors/generic/agent-registry.ts`
- `src/packages/frontend/frame-editors/llm/coding-agent.tsx`
- `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent.tsx`
- `src/packages/frontend/frame-editors/llm/help-me-fix.tsx`
- `src/packages/frontend/frame-editors/llm/agent-base/use-agent-session.ts`
- `src/packages/frontend/frame-editors/llm/history-budget.ts`
- `src/packages/frontend/frame-editors/agent-editor/agent-panel.tsx`
