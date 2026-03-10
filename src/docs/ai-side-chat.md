# AI Side Chat — Design Document

> **Status**: POC implemented on `claude/add-coding-agent-oyifN`.
> This document is the living design reference for the AI assistant
> integration in CoCalc's frame editors.

## Overview

The AI assistant is accessed via an **"Assistant" tab** in the existing
side chat panel, available in every frame editor. Clicking the tab (or
the title-bar Assistant button) switches from the regular collaborative
chat to an AI coding agent whose capabilities depend on the file type:

| File type                               | Agent variant      | Edit mechanism                           |
| --------------------------------------- | ------------------ | ---------------------------------------- |
| Code files (`.py`, `.tex`, `.js`, etc.) | **Coding Agent**   | Line-based edit blocks + three-way merge |
| Jupyter notebooks (`.ipynb`)            | **Notebook Agent** | Tool-calling loop against JupyterActions |
| `.app` files                            | **App Agent**      | writefile blocks + live iframe preview   |

All three share persistent sessions via SyncDB, LLM streaming, and a
common conversational UI pattern.

---

## Entry Points

```
Title-bar "Assistant" button
   |
   v
projectActions.open_chat({ path, chat_mode: "assistant" })
   |
   v
show_focused_frame_of_type("chat") + set_frame_tree({ chat_mode: "assistant" })
   |
   v
+--------------------------------------+
| Chat frame (generic/chat.tsx)        |
| +----------------------------------+ |
| |  [ Chat ]  [ Assistant ]         | |  <-- Segmented control
| +----------------------------------+ |
|                                      |
|  mode == "assistant"                 |
|    +-- .ipynb --> <NotebookAgent />  |
|    +-- other  --> <CodingAgentEmbed/>|
|                                      |
|  mode == "chat"                      |
|    +-- <SideChat /> (regular chat)   |
+--------------------------------------+
```

The chat frame reads `desc.get("chat_mode")` from the frame tree to
decide which tab is active. Switching tabs writes back via
`actions.set_frame_tree({ id, chat_mode })`, so the choice persists
across reloads and is collaborative (all viewers of the same frame see
the same tab).

**SyncDB readiness gate**: `initChat()` returns actions immediately,
but `actions.syncdb` is only set asynchronously after the SyncDB
"ready" event fires. To prevent agent components from mounting with
`syncdb=undefined` (which would cause them to fall back to standalone
mode and show stale data from a different storage file), `chat.tsx`
polls for `actions.syncdb` every 200ms and only renders the agent
component once it is available. A `<Spin />` is shown in the meantime.

---

## 1. Coding Agent (any code file)

**File**: `frame-editors/llm/coding-agent.tsx`
**Spec**: `frame-editors/llm/coding-agent-spec.ts`

### UI Layout

```
+----------------------------------------------+
| Editor (e.g. .py, .tex, .js)    | Side Chat  |
|                                 |+----------+|
|  def hello():                   ||[Chat|Asst]||
|      print("hi")                |+----------+|
|                                 || AI [model]||
|                                 |+----------+|
|                                 || Session ▼ ||
|                                 || [+New]    ||
|                                 || [Build]   ||
|                                 || [Clear]   ||
|                                 |+----------+|
|                                 || Messages  ||
|                                 || +--------+||
|                                 || |user(md) |||
|                                 || +--------+||
|                                 || assistant ||
|                                 || ┌diff────┐||
|                                 || │collaps. │||
|                                 || └────────┘||
|                                 |+----------+|
|                                 ||[Apply][B] ||
|                                 |+----------+|
|                                 ||[>cmd] [x] ||
|                                 |+----------+|
|                                 || markdown  ||
|                                 || input...  ||
|                                 || [Send]    ||
|                                 || [✓ Done]  ||
|                                 |+----------+|
+----------------------------------------------+
```

**Session bar**: Contains the turn/session dropdown, an explicit
**"+ New Turn"** button, the **Build** button (for LaTeX and other
buildable file types), and a Clear button. The Build button was moved
here from a separate row at the bottom of the panel.

**Input area**: Uses the multimode `MarkdownInput` component (same as
the side chat) with `fixedMode="markdown"`, supporting rich text
editing. Below the input are **Send** and **Done** buttons. The Done
button closes the current turn and starts a new one (enabled only
after the assistant has responded).

**User messages**: Rendered as **StaticMarkdown** — users can include
formatting, code snippets, and links in their prompts.

**Diff display**: Search/replace blocks are rendered as collapsible
diffs (see below).

### Edit Flow

1. **User sends message.** The agent captures a snapshot of the editor
   state:
   - Visible viewport content (up to 100 lines, the "base snapshot",
     stored with the message)
   - Cursor position and selection
   - Visible viewport range
   - File extension (for language-appropriate prompting)

   Only the visible portion of the document is included in the system
   prompt. The LLM can request additional lines via `<<<SHOW` blocks
   (see below).

2. **LLM responds** with one or more line-based edit blocks:

   ```
   <<<EDIT lines N-M
   replacement text (without line numbers)
   <<<END
   ```

   For a single line: `<<<EDIT line N`. To delete lines, use an empty
   replacement. Multiple edit blocks are applied bottom-to-top so line
   numbers remain stable.

   A legacy `<<<SEARCH`/`>>>REPLACE`/`<<<END` format is also supported
   as a fallback.

3. **LLM requests more context** (optional). If the LLM needs to see
   parts of the file outside the visible viewport, it emits:

   ```
   <<<SHOW lines N-M
   <<<END
   ```

   These are automatically fulfilled: the requested lines (up to 100
   per request) are extracted from the document and injected as the
   next user message, and the LLM continues its response. This loop
   is transparent to the user.

4. **Edits appear as pending.** An action bar shows:
   - "Apply to Editor" — applies all blocks
   - "Apply & Build" — applies and triggers `actions.build()` (LaTeX, etc.)
   - "Dismiss" — discards

5. **Three-way merge on apply.** Because the user may have kept editing
   while the AI was responding:
   - **Base** = the snapshot captured at step 1
   - **Local** = current editor content (user's version)
   - **Remote** = base + edit blocks applied
   - Result = `three_way_merge(base, local, remote)`

   This ensures concurrent user edits are not lost.

6. **Undo support.** Edits are applied via `actions.set_value()` which
   uses `cm.setValueNoJump()` → `cm.diffApply()` → `cm.replaceRange()`.
   Since `replaceRange` is a standard CodeMirror operation, each change
   is recorded in the editor's undo history. The user can **Ctrl+Z** to
   undo agent edits just like any manual edit.

7. **Shell command blocks** (` ```exec ... ``` `) are queued separately
   with per-command Run / Dismiss buttons and a confirmation popup
   before running. Results are written back as system messages.

### Collapsible Diffs

Edit blocks in assistant responses are rendered as ` ```diff ` code
blocks. To keep the chat readable when edits are large, these are
wrapped in a **CollapsibleDiffs** component:

- Font size is reduced to `0.82em`
- **Diff blocks**: Max height is 75% of the scroll container (auto-computed
  via `findScrollParent`) — users can review long diffs
- **Show-lines blocks** (document context): Capped at 55px (~3 lines)

This is implemented via a `useEffect` (with `[children]` dependency)
that applies inline styles to all `<pre>` elements inside the
container after content changes.

### Dual Mode

| Mode                         | SyncDB source                      | Record filter                     |
| ---------------------------- | ---------------------------------- | --------------------------------- |
| **Embedded** (side chat)     | Chat's own SyncDB                  | `event = "coding-agent"`          |
| **Standalone** (frame panel) | Hidden file `.{name}.coding-agent` | Primary keys `[session_id, date]` |

In embedded mode, agent messages use synthetic sender IDs
(`"coding-agent-assistant"`, `"coding-agent-system"`) to avoid
collisions with real chat messages.

---

## 2. Notebook Agent (Jupyter)

**File**: `frame-editors/jupyter-editor/notebook-agent.tsx`

### UI Layout

````
+----------------------------------------------+
| Jupyter Notebook                | Side Chat   |
| +--------------------------+    |+-----------+|
| | [1] import numpy          |    ||[Chat|Asst]||
| | [2] x = np.array(...)     |    |+-----------+|
| | [3] plt.plot(x)           |    || AI [model]||
| +--------------------------+    |+-----------+|
|                                 || Session v  ||
|                                 || [+New]     ||
|                                 |+-----------+|
|                                 || user:      ||
|                                 || "plot x^2" ||
|                                 ||            ||
|                                 || assistant: ||
|                                 || ```tool    ||
|                                 || get_cells  ||
|                                 || ```        ||
|                                 ||            ||
|                                 || [tool res] ||
|                                 |+-----------+|
|                                 || input...   ||
|                                 || [Send]     ||
|                                 |+-----------+|
+----------------------------------------------+
````

### Tool-Calling Loop

Instead of search/replace, the notebook agent uses a **multi-turn
tool loop** (up to 10 iterations):

````
User prompt
    |
    v
+---------------------+
| LLM turn            |
| (streaming response)|
+---------+-----------+
          |
    Has ```tool blocks?
    +-- No  --> done
    +-- Yes --+
              v
    +----------------+
    | Run tools      |  (in parallel)
    | against Jupyter |
    | Actions         |
    +--------+-------+
             |
    Write [Tool Result] to syncdb
             |
    Feed results back as next LLM turn
             |
             v
    (loop --- up to 10 iterations)
````

### Available Tools

| Tool          | Args                              | Description                                     |
| ------------- | --------------------------------- | ----------------------------------------------- |
| `cell_count`  | --                                | Total number of cells                           |
| `get_cell`    | `index`                           | Single cell input + output                      |
| `get_cells`   | `start, end`                      | Range of cells                                  |
| `run_cell`    | `index`                           | Run cell, poll until done (500ms, 2min timeout) |
| `insert_cell` | `after_index, content, cell_type` | Insert new cell                                 |
| `set_cell`    | `index, content`                  | Replace cell content                            |
| `delete_cell` | `index`                           | Delete cell                                     |

Tool blocks are JSON inside fenced code:

```
\`\`\`tool
{"name": "run_cell", "args": {"index": 2}}
\`\`\`
```

`run_cell` is notable: it triggers cell evaluation via JupyterActions,
then **polls** cell state every 500ms until idle or a 2-minute timeout,
returning the actual cell output to the LLM so it can reason about
results.

### SyncDB

Same as coding agent: piggybacks on the chat SyncDB with
`event = "notebook-agent"` in embedded mode.

---

## 3. App Agent (.app files)

**Directory**: `frame-editors/agent-editor/`

| File                   | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `register.ts`          | Registers `.app` file type                        |
| `editor.ts`            | Editor spec: `ai-agent` + `ai-app-preview` frames |
| `actions.ts`           | Extends CodeEditorActions; stores `app_errors`    |
| `agent-panel.tsx`      | Conversation UI for app-building agent            |
| `app-preview.tsx`      | Renders index.html in sandboxed iframe            |
| `cocalc-app-bridge.ts` | Bridge SDK source (injected into iframe)          |
| `bridge-host.ts`       | postMessage handler for bridge requests           |

### UI Layout

````
+-----------------------+-----------------------+
| Agent Panel            | App Preview            |
| +-------------------+  | +-------------------+  |
| | AI Avatar [model] |  | | [App] [Server]    |  |
| +-------------------+  | | [Reload]          |  |
| | [History] [+New]  |  | +-------------------+  |
| | [Done] [Clear]    |  | |                   |  |
| +-------------------+  | |    <iframe>       |  |
| |                   |  | |    index.html     |  |
| | user:             |  | |                   |  |
| | "make a           |  | |  +-----------+    |  |
| |  calculator"      |  | |  |  7  8  9  |    |  |
| |                   |  | |  |  4  5  6  |    |  |
| | assistant:        |  | |  |  1  2  3  |    |  |
| | ```writefile      |  | |  |    0      |    |  |
| | index.html        |  | |  +-----------+    |  |
| | ...               |  | |                   |  |
| | ```               |  | |                   |  |
| |                   |  | |                   |  |
| | system:           |  | |                   |  |
| | Wrote 1 file      |  | |                   |  |
| +-------------------+  | |                   |  |
| | [>Run] cmd        |  | |                   |  |
| +-------------------+  | |                   |  |
| | input...          |  | |                   |  |
| | [Send]            |  | |                   |  |
| +-------------------+  | +-------------------+  |
+-----------------------+-----------------------+
````

Default split: 40% agent panel, 60% app preview.

### Write Blocks

The agent writes files via fenced code blocks:

```
\`\`\`writefile path/to/file.html
<!DOCTYPE html>
<html>...</html>
\`\`\`
```

These are auto-applied (written to the project filesystem immediately).
The bridge SDK (`cocalc-app-bridge.js`) is also auto-injected into the
app directory before each write batch.

### Bridge SDK (window.cocalc)

Injected into the iframe, provides runtime access to CoCalc services:

| Category       | Methods                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| **Shell**      | `cocalc.exec(cmd, args?, opts?)`                                                                                |
| **Code**       | `cocalc.run(lang, code)`, `cocalc.python(code)`, `cocalc.R(code)`, `cocalc.julia(code)`                         |
| **Files**      | `cocalc.readFile(path)`, `cocalc.writeFile(path, content)`, `cocalc.deleteFile(path)`, `cocalc.listFiles(path)` |
| **Python env** | `cocalc.uv.init(packages?)`, `cocalc.uv.add(pkg)`, `cocalc.uv.run(code)`                                        |
| **KV store**   | `cocalc.kvGet(key)`, `cocalc.kvSet(key, val)`, `cocalc.kvDelete(key)`, `cocalc.kvGetAll()`                      |
| **Utilities**  | `cocalc.ping()`, `cocalc.portURL(port)`                                                                         |

Communication is via postMessage between iframe and parent:

```
iframe                          parent (app-preview.tsx)
  |                                |
  |  cocalc-bridge-request         |
  |  { type, id, ...params }  -->  |  createBridgeHost()
  |                                |  handles request
  |  bridge-response               |
  |  { id, result?, error? }  <--  |
  |                                |
```

**Error capture**: The bridge intercepts `onerror`,
`unhandledrejection`, and `console.error` in the iframe and feeds
them back to the agent as context for self-correction.

---

## Data Model

All three agents store messages in SyncDB with the same schema:

```
+----------------+-----------------+----------------------------------+
| Field          | Type            | Notes                            |
+----------------+-----------------+----------------------------------+
| session_id     | string (UUID)   | groups messages into sessions    |
| date           | ISO timestamp   | ordering + primary key           |
| sender         | string          | "user" / "assistant" / "system"  |
| content        | string          | message body                     |
| event          | string          | "message" / "exec_result" /      |
|                |                 | "tool_result"                    |
| account_id     | string          | user's CoCalc account ID         |
| base_snapshot  | string          | coding agent: doc state at send  |
+----------------+-----------------+----------------------------------+
```

### Embedded vs Standalone storage

|                            | SyncDB source                     | Primary keys               | Filtering                                      |
| -------------------------- | --------------------------------- | -------------------------- | ---------------------------------------------- |
| **Embedded** (side chat)   | Chat's SyncDB (`.name.sage-chat`) | `[date, sender_id, event]` | `event = "coding-agent"` or `"notebook-agent"` |
| **Standalone** (own frame) | Hidden meta file                  | `[session_id, date]`       | None needed                                    |
| **App agent** (`.app`)     | `.app` file's own SyncDB          | `[session_id, date]`       | None needed                                    |

### Session Management

Each agent supports multiple sessions (conversation threads) per file.
Sessions are UUID-identified. The UI shows a session dropdown and a
"New Session" button. Switching sessions re-filters the SyncDB view.

---

## LLM Integration

All agents use the same streaming pattern:

```typescript
const stream = webapp_client.openai_client.queryStream({
  input,
  system,
  history, // [{role: "user"|"assistant", content}]
  model, // from useLanguageModelSetting(project_id)
  project_id,
  tag, // "coding-agent" | "notebook-agent" | "ai-agent"
});

stream.on("token", (token) => {
  /* append to response */
});
stream.on("error", (err) => {
  /* display error */
});
```

Model selection is per-project, persisted via `useLanguageModelSetting`.

---

## Key Design Decisions

| Decision                                                  | Rationale                                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Reuse side chat panel (tabs) rather than a separate frame | Minimal UI footprint; users already know where side chat is                            |
| Line-based edit blocks + three-way merge for code files   | Handles concurrent user edits gracefully; works for any text file; line numbers are more reliable than text search |
| Tool-calling loop for notebooks                           | Jupyter cells are structured objects, not a single text buffer; tools are more natural |
| Bridge SDK via postMessage for .app apps                  | Iframe sandbox isolation; no special privileges needed                                 |
| SyncDB for session storage                                | Collaborative -- all project members see the same conversation                         |
| Base snapshot captured at send time                       | Consistent merge baseline even if user edits during LLM response                       |

---

## File Index

| Component                    | Path                                              |
| ---------------------------- | ------------------------------------------------- |
| Chat frame (tab switcher)    | `frame-editors/generic/chat.tsx`                  |
| Coding agent (main)          | `frame-editors/llm/coding-agent.tsx`              |
| Coding agent types           | `frame-editors/llm/coding-agent-types.ts`         |
| Coding agent utilities       | `frame-editors/llm/coding-agent-utils.ts`         |
| Coding agent UI components   | `frame-editors/llm/coding-agent-components.tsx`   |
| Coding agent spec            | `frame-editors/llm/coding-agent-spec.ts`          |
| Notebook agent               | `frame-editors/jupyter-editor/notebook-agent.tsx` |
| Agent editor panel           | `frame-editors/agent-editor/agent-panel.tsx`      |
| Agent editor spec            | `frame-editors/agent-editor/editor.ts`            |
| Agent actions                | `frame-editors/agent-editor/actions.ts`           |
| App preview                  | `frame-editors/agent-editor/app-preview.tsx`      |
| Bridge SDK source            | `frame-editors/agent-editor/cocalc-app-bridge.ts` |
| Bridge host                  | `frame-editors/agent-editor/bridge-host.ts`       |
| Title bar (assistant button) | `frame-editors/frame-tree/title-bar.tsx`          |
| Project actions (open_chat)  | `project_actions.ts`                              |

All paths relative to `packages/frontend/`.

---

## Remaining Tasks

### P2 — Important

- [ ] **`notebook-agent.tsx` stale `sessionId` closure**: History
  loading captures `sessionId` via closure instead of using a ref.
  Same bug that was already fixed in coding-agent.
- [ ] **`buildSystemPrompt` coupled to CodeMirror**: Uses CM-specific
  APIs (`getScrollInfo`, `lineAtHeight`). Gracefully degrades via
  syncstring fallback when CM unavailable. Future concern.
- [ ] **Session name via sentinel date**: Uses `"session_name:${sid}"`
  as the date field — relies on string parsing. Works but fragile.

### P3 — Minor

- [ ] **No keyboard shortcut** to open the agent panel.
- [ ] **Session list doesn't show timestamps** or sort by recency in
  the dropdown.

---

## Open Questions / Next Steps

- **Multi-file edits**: The coding agent currently operates on a single
  file. Supporting edits across multiple files would need a different
  context-gathering and apply strategy.
- **Streaming apply**: Could edits be applied incrementally as the LLM
  streams, rather than waiting for the full response?
- **Notebook agent tool confirmation**: Unlike the coding agent's
  command blocks, notebook tool calls (including `run_cell`) run
  without user confirmation. Should destructive operations (delete,
  overwrite) require approval?
- **Editor context indicator**: Above the input box, show a small
  `GRAY_LLL`-background block summarizing what the LLM will "see" from
  the editor, derived from CodeMirror state:
  - **Cursor only**: "Cursor at line 42"
  - **Line range selected**: "Lines 10–25 selected"
  - **Partial text selected in a single line**: 'Line 17: "the selected
    word or phrase"' (verbatim copy, so the LLM knows the user is asking
    about that specific text)
  This context is already captured by `getEditorContext()` and included
  in the system prompt, but the user currently has no visibility into
  what the agent receives. Showing it in the UI achieves two things:
  (1) the user can verify/adjust the context before sending, and
  (2) it teaches users that cursor position and selection influence the
  agent's behavior, encouraging them to select the relevant code before
  asking a question.
