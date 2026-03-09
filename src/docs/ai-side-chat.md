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
| Code files (`.py`, `.tex`, `.js`, etc.) | **Coding Agent**   | Search/replace blocks + three-way merge  |
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
   - Full document content (the "base snapshot", stored with the message)
   - Cursor position and selection
   - Visible viewport range
   - File extension (for language-appropriate prompting)

2. **LLM responds** with one or more search/replace blocks:

   ```
   <<<SEARCH
   exact text to find in the file
   >>>REPLACE
   replacement text
   <<<END
   ```

3. **Edits appear as pending.** An action bar shows:
   - "Apply to Editor" -- applies all blocks
   - "Apply & Build" -- applies and triggers `actions.build()` (LaTeX, etc.)
   - "Dismiss" -- discards

4. **Three-way merge on apply.** Because the user may have kept editing
   while the AI was responding:
   - **Base** = the snapshot captured at step 1
   - **Local** = current editor content (user's version)
   - **Remote** = base + search/replace patches applied
   - Result = `three_way_merge(base, local, remote)`

   This ensures concurrent user edits are not lost.

5. **Shell command blocks** (` ```exec ... ``` `) are queued separately
   with per-command Run / Dismiss buttons and a confirmation popup
   before running. Results are written back as system messages.

### Collapsible Diffs

Search/replace blocks in assistant responses are rendered as
` ```diff ` code blocks. To keep the chat readable when edits are
large, these are wrapped in a **CollapsibleDiffs** component:

- Font size is reduced to `0.82em`
- Max height is capped at **150px** with `overflow: hidden`
- Clicking a diff block **toggles** it between collapsed (150px) and
  fully expanded (`max-height: none`, `overflow: auto`)
- The cursor changes to `pointer` to signal interactivity

This is implemented via a `useEffect` that applies inline styles to
all `<pre>` elements inside the container, plus a delegated click
handler that walks up from the click target to find the enclosing
`<pre>`.

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
| Search/replace + three-way merge for code files           | Handles concurrent user edits gracefully; works for any text file                      |
| Tool-calling loop for notebooks                           | Jupyter cells are structured objects, not a single text buffer; tools are more natural |
| Bridge SDK via postMessage for .app apps                  | Iframe sandbox isolation; no special privileges needed                                 |
| SyncDB for session storage                                | Collaborative -- all project members see the same conversation                         |
| Base snapshot captured at send time                       | Consistent merge baseline even if user edits during LLM response                       |

---

## File Index

| Component                    | Path                                              |
| ---------------------------- | ------------------------------------------------- |
| Chat frame (tab switcher)    | `frame-editors/generic/chat.tsx`                  |
| Coding agent                 | `frame-editors/llm/coding-agent.tsx`              |
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

## Known Bugs (POC) — Remaining

_(None currently tracked — report new issues as they arise.)_

## Recently Fixed

- **Stale data on page refresh**: Agent components mounted before the
  chat SyncDB was ready, falling back to standalone mode and showing
  old data from a `.coding-agent` meta file. Fixed with a SyncDB
  readiness gate in `chat.tsx` (polls every 200ms, shows spinner).
- **Stale closure in session reload**: `loadSessionsAndMessages`
  captured a stale `sessionId` via closure. Fixed by introducing a
  `sessionIdRef` that is always current.
- **Build button placement**: Moved from a standalone row at the
  bottom of the panel to the session bar at the top, next to the
  turn selector and "+ New" button.
- **Input area upgrade**: Replaced plain `TextArea` with the multimode
  `MarkdownInput` component (`fixedMode="markdown"`, `compact`).
- **"+ New Turn" button**: Moved from a dropdown menu entry to an
  explicit button in the session bar for discoverability.
- **"Done" button**: Added below the Send button. Closes the current
  turn (marks it complete) and starts a new one. Disabled until the
  assistant has responded at least once.
- **User messages as markdown**: User messages now render via
  `StaticMarkdown` instead of plain text.
- **Collapsible diffs**: Search/replace diff blocks are capped at
  150px height with smaller font; click to expand/collapse.
- **antd Tooltip deprecation**: Migrated `overlayInnerStyle` to
  `styles={{ body: {} }}` in `run-button/index.tsx`.
- Assistant tab icon: now uses `AIAvatar` instead of generic robot icon
- Diff rendering: search/replace blocks rendered as ` ```diff ` instead
  of raw markers (which markdown parsed as blockquotes)
- Apply feedback: shows error when search blocks don't match
- Turn ordering: chronological by first message date, not random UUID sort
- Session fragmentation: explicit session_id on first-turn writes
- Bridge origin validation + writefile path traversal guard
- `.ai` → `.app` extension, frame type mismatch, LangChain brace escaping,
  Shift+Enter sends, Turns UI

---

## Open Questions / Next Steps

- **Undo support**: Applying edits is currently a one-shot write to
  syncstring. Should there be an explicit undo that reverts to the
  base snapshot?
- **Multi-file edits**: The coding agent currently operates on a single
  file. Supporting edits across multiple files would need a different
  context-gathering and apply strategy.
- **Token budget / context window**: Large files may exceed the model's
  context. Should we send only the visible portion + selection, or
  always send the full file with truncation warnings?
- **Streaming apply**: Could edits be applied incrementally as the LLM
  streams, rather than waiting for the full response?
- **Security**: The .app bridge SDK gives iframe apps access to file
  I/O and shell commands. What sandboxing / permission model is
  appropriate?
- **Notebook agent tool confirmation**: Unlike the coding agent's
  command blocks, notebook tool calls (including `run_cell`) run
  without user confirmation. Should destructive operations (delete,
  overwrite) require approval?
