# Notebook Agent: Context-Aware Editing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Jupyter NotebookAgent with context awareness (focused cell, cursor, selection), dual-mode editing (full replace + search/replace patches), batch cell insertion, and confirm-to-run cell execution.

**Architecture:** Three layers of changes:
1. **Notebook editor API** — add 2 public methods to `NotebookFrameActions` for cursor position and selection range (currently only `getCellSelection` exists)
2. **Utilities** — `notebook-agent-utils.ts` with pure functions (context extraction, system prompt, tool dispatch, cell fencing)
3. **Component** — rewrite `notebook-agent.tsx` with context indicator, pending runs, dual-mode editing

Reuses shared `agent-base/` for session/UI, `split-cells.ts` for parsing, `coding-agent-utils.ts` for search/replace, and `backtickSequence()` for safe fencing.

**Tech Stack:** React, TypeScript, Ant Design, CoCalc agent-base, JupyterActions/Store APIs

**Spec:** `docs/superpowers/specs/2026-03-10-notebook-agent-context-design.md`

---

## File Structure

**Modify (notebook editor layer):**
- `src/packages/frontend/frame-editors/jupyter-editor/cell-notebook/actions.ts`
  - Extend `EditorFunctions` interface with `getSelectionRange?()`
  - Add `getCursorPosition(id?)` — public method returning `{ line, ch }` for a cell
  - Add `getSelectionRange(id?)` — public method returning `{ fromLine, toLine }` for a cell
- `src/packages/frontend/jupyter/codemirror-editor.tsx`
  - Wire `getSelectionRange` in editor registration using CM's `getCursor("from")`/`getCursor("to")`

**Create:**
- `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.ts`
  - Constants (TAG, thresholds, limits)
  - `fenceCell()` — safe backtick fencing for cell content
  - `truncate()` — string truncation for LLM display
  - `NotebookContext` type + `getNotebookContext()` — extract focused cell, cursor, selection
  - `buildContextLabel()` — human-readable indicator string
  - `getCellOutput()` — extract text output from cell
  - `ToolCall` type + `parseToolBlocks()` — parse tool blocks from LLM response
  - `runToolBatch()` / `runSingleTool()` — dispatch all 7 tools with live cell list re-reads after mutations
  - `executeCell()` — run cell + poll for completion (called after user confirms)
  - `buildSystemPrompt()` — full system prompt with context and tool docs

**Modify:**
- `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent.tsx`
  - Full rewrite of the component: add context capture, indicator, pending runs, dual-mode editing

**Reuse (import only, no changes):**
- `src/packages/frontend/jupyter/llm/split-cells.ts` — `splitCells()`
- `src/packages/frontend/frame-editors/llm/coding-agent-utils.ts` — `parseSearchReplaceBlocks()`, `applySearchReplace()`
- `src/packages/frontend/markdown/util.ts` — `backtickSequence()`
- `src/packages/frontend/frame-editors/llm/agent-base/` — all shared UI components

---

## Chunk 1: Notebook Editor API Extensions

### Task 1: Extend EditorFunctions interface and wire selection range

**Files:**
- Modify: `src/packages/frontend/frame-editors/jupyter-editor/cell-notebook/actions.ts` (interface + public methods)
- Modify: `src/packages/frontend/jupyter/codemirror-editor.tsx` (wire `getSelectionRange` for code cells)

The `input_editors` field is private and `EditorFunctions` doesn't expose selection range data. We need to:
1. Add `getSelectionRange?()` to the `EditorFunctions` interface
2. Wire it in the CodeMirror editor registration (code cells)
3. Add public methods on `NotebookFrameActions`

Markdown cells (Slate editor) only register `set_cursor` and `get_cursor` — they don't support `getSelection` or selection ranges. This is a known limitation; markdown-cell selection context will show only the cursor position.

- [ ] **Step 1: Extend EditorFunctions interface**

In `cell-notebook/actions.ts`, add to the `EditorFunctions` interface (around line 30):

```typescript
export interface EditorFunctions {
  set_cursor: (pos: { x?: number; y?: number }) => void;
  get_cursor: () => { line: number; ch: number };
  save?: () => string | undefined;
  tab_key?: () => void;
  shift_tab_key?: () => void;
  refresh?: () => void;
  get_cursor_xy?: () => { x: number; y: number };
  getSelection?: () => string;
  /** Return 0-based line range of the current selection, if any. */
  getSelectionRange?: () => { fromLine: number; toLine: number } | undefined;
  focus?: () => void;
}
```

- [ ] **Step 2: Wire getSelectionRange in CodeMirror editor**

In `codemirror-editor.tsx`, add to the editor object registered at line ~738:

```typescript
const editor = {
  // ... existing methods ...
  getSelection: () => cm.current.getSelection(),
  getSelectionRange: () => {
    const sel = cm.current.getSelection();
    if (!sel) return undefined;
    const from = cm.current.getCursor("from");
    const to = cm.current.getCursor("to");
    return { fromLine: from.line, toLine: to.line };
  },
};
```

This uses CodeMirror's `getCursor("from")` / `getCursor("to")` for exact selection bounds — no heuristics needed.

- [ ] **Step 3: Add public methods to NotebookFrameActions**

In `cell-notebook/actions.ts`, add after `getCellSelection` (around line 733):

```typescript
/** Get cursor position for a specific cell (or the focused cell). */
getCursorPosition(id?: string): { line: number; ch: number } | undefined {
  const cellId = id ?? this.store.get("cur_id");
  if (!cellId) return undefined;
  return this.input_editors[cellId]?.get_cursor?.();
}

/** Get the 0-based line range of the current selection in a cell.
 *  Returns undefined if no selection or if the editor doesn't support it
 *  (e.g., markdown/Slate cells). */
getSelectionRange(id?: string): { fromLine: number; toLine: number } | undefined {
  const cellId = id ?? this.store.get("cur_id");
  if (!cellId) return undefined;
  return this.input_editors[cellId]?.getSelectionRange?.();
}
```

- [ ] **Step 4: Commit**

```
notebook-agent: extend EditorFunctions with getSelectionRange, wire in CodeMirror, add public methods
```

---

## Chunk 2: Utilities File

### Task 2: Create notebook-agent-utils.ts with constants and fencing

**Files:**
- Create: `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.ts`

- [ ] **Step 1: Create the file with imports, constants, fenceCell, and truncate**

Key imports:
- `backtickSequence` from `@cocalc/frontend/markdown/util`
- `parseSearchReplaceBlocks`, `applySearchReplace` from `@cocalc/frontend/frame-editors/llm/coding-agent-utils`
- `splitCells` from `@cocalc/frontend/jupyter/llm/split-cells`
- `JupyterActions` type from `@cocalc/frontend/jupyter/browser-actions`

Constants:
- `TAG = "notebook-agent"`
- `MAX_OUTPUT_CHARS = 4000`
- `CELL_RUN_POLL_MS = 500`
- `CELL_RUN_TIMEOUT_MS = 120_000`
- `MAX_TOOL_LOOPS = 10`
- `LARGE_CELL_THRESHOLD = 1000`

`fenceCell(content, cellType, language)`: Uses `backtickSequence(content, lang)` where lang is the notebook language for code cells or "markdown" for markdown cells. Returns `open + "\n" + content + "\n" + close`.

`truncate(s, maxLen)`: Truncates with `"... (truncated, N chars total)"` suffix.

- [ ] **Step 2: Commit**

```
notebook-agent: create utils file with constants and fenceCell helper
```

---

### Task 3: Add context extraction

**Files:**
- Modify: `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.ts`

- [ ] **Step 1: Add NotebookContext interface**

Fields:
- `cellIndex?: number` (1-based)
- `cellId?: string`
- `cellType?: "code" | "markdown" | "raw"`
- `cellContent?: string`
- `cursorLine?: number` (0-based)
- `selection?: string`
- `selectionRange?: { fromLine: number; toLine: number }` (0-based)
- `selectedCellIndices?: number[]` (1-based)
- `totalCells: number`
- `kernelName: string`
- `language: string`

- [ ] **Step 2: Add getNotebookContext(actions) function**

**Critical: Frame resolution.** The agent runs in the chat frame, not the notebook frame. Use `_get_most_recent_active_frame_id_of_type("jupyter_cell_notebook")` to find the notebook frame ID reliably. This is the standard pattern used by `jump_to_cell()` and `show_table_of_contents()` in `jupyter-editor/actions.ts`.

Access chain:
1. `actions.jupyter_actions` → `store` for cells, kernel_info, cell_list
2. `(actions as any)._get_most_recent_active_frame_id_of_type("jupyter_cell_notebook")` → notebook frame ID
3. `actions.get_frame_actions(notebookFrameId)` → `NotebookFrameActions`
4. `frameActions.store.get("cur_id")` → focused cell ID
5. `frameActions.store.get_selected_cell_ids_list()` → ordered list of all selected cell IDs (includes `cur_id` + `sel_ids`; canonical API for multi-cell selection)
6. `frameActions.getCursorPosition(curId)` → cursor `{ line, ch }` (new public method from Task 1)
7. `frameActions.getCellSelection(curId)` → selected text (existing public method; code cells only — markdown cells return empty)
8. `frameActions.getSelectionRange(curId)` → `{ fromLine, toLine }` (new public method from Task 1; code cells only)

Gracefully return partial context if any step fails (no notebook frame, no cursor, etc.).

- [ ] **Step 3: Add buildContextLabel(ctx) function**

Label logic:
- Multi-cell: `"Cells #min–max selected"`
- Selection on single line: `'Cell #N, line L: "text..."'` (truncated to 60 chars)
- Multi-line selection: `"Cell #N, lines L1–L2 selected"`
- Cursor only: `"Cell #N (type), line L"`
- Cell only: `"Cell #N (type)"`

- [ ] **Step 4: Commit**

```
notebook-agent: add context extraction and indicator label builder
```

---

### Task 4: Add cell output extraction and tool parsing

**Files:**
- Modify: `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.ts`

- [ ] **Step 1: Add getCellOutput(cell) helper**

Same logic as the existing one in `notebook-agent.tsx`: iterate over output messages, extract text, data/text/plain, and error info. Returns joined string.

- [ ] **Step 2: Add ToolCall interface and parseToolBlocks(text) function**

Same regex-based parser as existing: match ` ```tool\n...\n``` ` blocks, JSON.parse each, extract name+args.

- [ ] **Step 3: Commit**

```
notebook-agent: add cell output extraction and tool parsing
```

---

### Task 5: Add tool dispatcher

**Files:**
- Modify: `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.ts`

- [ ] **Step 1: Add PendingRun type and resolveIndex helper**

`PendingRun`: `{ cellIndex: number /* 1-based */, cellId: string }`

`resolveIndex(index1, cellList)`: Convert 1-based to 0-based with bounds check. Returns `{ idx, cellId }` or `{ error }`.

- [ ] **Step 2: Add runToolBatch function**

**Critical: Index stability after mutations.** The initial plan snapshotted cell_list once per batch, but this breaks when a batch contains `insert_cells` followed by `get_cell` or `run_cell` referencing the newly inserted cells.

**Fix:** Categorize tools as **read-only** (`cell_count`, `get_cell`, `get_cells`) vs **mutating** (`set_cell`, `edit_cell`, `insert_cells`, `run_cell`). After any mutating tool completes, **re-read** `cell_list` from the store for subsequent tools in the batch. This way indices stay correct after insertions.

Implementation:
```
snapshot cellList = store.get("cell_list")
for each tool in batch:
  resolve index against current cellList
  execute tool
  if tool is mutating:
    cellList = store.get("cell_list")  // refresh
```

Also add a note in the system prompt: "After insert_cells, subsequent tool calls in the same response will see updated cell indices."

- [ ] **Step 3: Add runSingleTool function with all 7 tools**

Tool implementations:

- `cell_count`: Return `cellList.length`
- `get_cell`: Resolve index, read cell, fence input with `fenceCell()`, truncate output
- `get_cells`: Range loop (both inclusive, 1-based), fence each cell
- `set_cell`: Resolve index, `jupyterActions.set_cell_input(cellId, content, true)` — **mutating**
- `edit_cell`: Resolve index, `parseSearchReplaceBlocks(edits)`, `applySearchReplace(currentInput, blocks)`, apply if changes — **mutating**
- `insert_cells`: Parse `cells_markdown` with `splitCells()`. Chain inserts using `insert_cell_at(0)` or `insert_cell_adjacent(prevId, +1)`. Set type and content for each. — **mutating**
- `run_cell`: Resolve index, push to `pendingRuns` array (don't execute), return "pending_confirmation"

- [ ] **Step 4: Add executeCell function**

Called after user confirms. Runs `jupyterActions.run_cell(cellId, true)`, polls `cell.get("state")` every 500ms until "idle" or 120s timeout. Returns JSON with output.

- [ ] **Step 5: Commit**

```
notebook-agent: add tool dispatcher with all 7 tools and live index refresh
```

---

### Task 6: Add system prompt builder

**Files:**
- Modify: `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.ts`

- [ ] **Step 1: Add buildSystemPrompt(ctx: NotebookContext) function**

Sections:
1. Role: "You are an AI assistant for a Jupyter notebook."
2. Kernel: `Kernel: "${ctx.kernelName}". Programming language: "${ctx.language}".`
3. Overview: `The notebook has N cells.`
4. Focused cell (if available): index, type, cursor, selection, fenced content
5. Tool documentation: all 7 tools with format examples, 1-based indices, inclusive ranges
6. Edit rules: set_cell for <1000 chars, edit_cell for >=1000 chars
7. Run rules: user confirms before execution
8. Index note: "After insert_cells, subsequent tool calls in the same response will see updated cell indices."

- [ ] **Step 2: Commit**

```
notebook-agent: add system prompt builder with context and tool docs
```

---

## Chunk 3: Unit Tests

### Task 7: Add unit tests for notebook-agent-utils

**Files:**
- Create: `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.test.ts`

There is precedent for this style of test in the codebase (see coding-agent-utils tests). These are pure function tests that don't need React or DOM.

- [ ] **Step 1: Test fenceCell**

```typescript
import { fenceCell, truncate, buildContextLabel, parseToolBlocks } from "./notebook-agent-utils";

describe("fenceCell", () => {
  test("code cell uses language", () => {
    const result = fenceCell("print('hi')", "code", "python");
    expect(result).toContain("```python");
    expect(result).toContain("print('hi')");
  });

  test("markdown cell uses 'markdown'", () => {
    const result = fenceCell("# Title", "markdown", "python");
    expect(result).toContain("```markdown");
  });

  test("handles content with backticks", () => {
    const result = fenceCell("```\ncode\n```", "code", "python");
    // backtickSequence should produce 4+ backticks
    expect(result.startsWith("````")).toBe(true);
  });
});
```

- [ ] **Step 2: Test truncate**

```typescript
describe("truncate", () => {
  test("short strings unchanged", () => {
    expect(truncate("hello", 100)).toBe("hello");
  });

  test("long strings truncated with message", () => {
    const long = "x".repeat(200);
    const result = truncate(long, 100);
    expect(result.length).toBeLessThan(200);
    expect(result).toContain("truncated");
    expect(result).toContain("200 chars total");
  });
});
```

- [ ] **Step 3: Test parseToolBlocks**

```typescript
describe("parseToolBlocks", () => {
  test("parses single tool block", () => {
    const text = 'Some text\n```tool\n{"name": "cell_count", "args": {}}\n```\nMore text';
    const blocks = parseToolBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("cell_count");
  });

  test("parses multiple tool blocks", () => {
    const text = '```tool\n{"name": "get_cell", "args": {"index": 1}}\n```\n```tool\n{"name": "run_cell", "args": {"index": 2}}\n```';
    const blocks = parseToolBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].name).toBe("get_cell");
    expect(blocks[1].name).toBe("run_cell");
  });

  test("skips malformed JSON", () => {
    const text = '```tool\n{not valid json}\n```';
    const blocks = parseToolBlocks(text);
    expect(blocks).toHaveLength(0);
  });

  test("returns empty for no tool blocks", () => {
    const blocks = parseToolBlocks("just regular text");
    expect(blocks).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Test buildContextLabel**

```typescript
describe("buildContextLabel", () => {
  const base = { totalCells: 10, kernelName: "Python 3", language: "python" };

  test("no cell focused", () => {
    expect(buildContextLabel(base)).toBe("");
  });

  test("cell focused, no cursor", () => {
    expect(buildContextLabel({ ...base, cellIndex: 5, cellType: "code" }))
      .toBe("Cell #5 (code)");
  });

  test("cursor at line", () => {
    expect(buildContextLabel({ ...base, cellIndex: 3, cellType: "code", cursorLine: 11 }))
      .toBe("Cell #3 (code), line 12");
  });

  test("single-line selection", () => {
    expect(buildContextLabel({
      ...base,
      cellIndex: 2,
      selection: "x = 42",
      selectionRange: { fromLine: 4, toLine: 4 },
    })).toBe('Cell #2, line 5: "x = 42"');
  });

  test("multi-line selection", () => {
    expect(buildContextLabel({
      ...base,
      cellIndex: 2,
      selection: "x = 42\ny = 43",
      selectionRange: { fromLine: 4, toLine: 5 },
    })).toBe("Cell #2, lines 5–6 selected");
  });

  test("multi-cell selection", () => {
    expect(buildContextLabel({
      ...base,
      cellIndex: 3,
      selectedCellIndices: [3, 4, 5, 6, 7],
    })).toBe("Cells #3–7 selected");
  });

  test("long selection text truncated", () => {
    const longSel = "a".repeat(100);
    const label = buildContextLabel({
      ...base,
      cellIndex: 1,
      selection: longSel,
      selectionRange: { fromLine: 0, toLine: 0 },
    });
    expect(label.length).toBeLessThan(100);
    expect(label).toContain("...");
  });
});
```

- [ ] **Step 5: Test resolveIndex (export it for testing)**

Make `resolveIndex` an exported function in `notebook-agent-utils.ts`.

```typescript
import { resolveIndex } from "./notebook-agent-utils";

describe("resolveIndex", () => {
  const cellList = ["id-a", "id-b", "id-c"];

  test("valid 1-based index", () => {
    const res = resolveIndex(2, cellList);
    expect(res).toEqual({ idx: 1, cellId: "id-b" });
  });

  test("index 0 is out of range", () => {
    const res = resolveIndex(0, cellList);
    expect("error" in res).toBe(true);
  });

  test("index beyond length is out of range", () => {
    const res = resolveIndex(4, cellList);
    expect("error" in res).toBe(true);
  });
});
```

- [ ] **Step 6: Commit**

```
notebook-agent: add unit tests for utils (fenceCell, parseToolBlocks, contextLabel, resolveIndex)
```

---

## Chunk 4: Component Rewrite

### Task 8: Rewrite notebook-agent.tsx

**Files:**
- Modify: `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent.tsx`

- [ ] **Step 1: Rewrite imports**

Remove old local helpers (buildSystemPrompt, parseToolBlocks, runTool, getCellOutput, truncate, ToolCall type, constants).

Add imports from `./notebook-agent-utils`:
- `TAG`, `MAX_TOOL_LOOPS`, `buildContextLabel`, `buildSystemPrompt`, `executeCell`, `getNotebookContext`, `parseToolBlocks`, `runToolBatch`, `NotebookContext`, `PendingRun`

Add new UI imports:
- `Button` from antd
- `Icon` from `@cocalc/frontend/components`
- `COLORS` from `@cocalc/util/theme`

- [ ] **Step 2: Add new state variables**

- `lastSubmittedRef = useRef("")` — for Stop button restore
- `notebookContextRef = useRef<NotebookContext | null>(null)` — context snapshot
- `[editorContextLabel, setEditorContextLabel] = useState("")` — indicator text
- `[pendingRuns, setPendingRuns] = useState<PendingRun[]>([])` — pending run confirmations

- [ ] **Step 3: Add updateContext callback**

Called on input focus. Calls `getNotebookContext(actions)`, stores in ref, builds label with `buildContextLabel()`.

- [ ] **Step 4: Add handleConfirmRun and handleDismissRun callbacks**

`handleConfirmRun(run)`: Remove from pendingRuns, call `executeCell()`, write result as "tool_result" system message.

`handleDismissRun(run)`: Remove from pendingRuns, write "User declined" as "tool_result" system message.

- [ ] **Step 5: Update handleSubmit**

Key changes from current:
- Save `lastSubmittedRef.current = prompt` before clearing input
- Build system prompt using `notebookContextRef.current ?? getNotebookContext(actions)`
- After parsing tool blocks, use `runToolBatch()` instead of individual `runTool()` calls
- Collect `pendingRuns` from the batch and add to state via `setPendingRuns`
- Keep the same tool-calling loop structure (up to MAX_TOOL_LOOPS iterations)

- [ ] **Step 6: Update render JSX**

Structure (top to bottom):
1. `<AgentHeader>` — unchanged
2. `<AgentSessionBar>` — unchanged
3. `<AgentMessages>` — unchanged
4. `<AgentError>` — unchanged
5. **Pending runs bar** (new) — blue background (COLORS.ANTD_BG_BLUE_L), shows "Run cell #N?" with Run/Dismiss buttons for each pending run. Uses `flex: "0 0 auto"`.
6. **Context indicator** (new) — yellow background (COLORS.YELL_LLL), shows `editorContextLabel`. Uses `flex: "0 0 auto"`. Same styling as coding agent.
7. `<AgentInputArea>` — add `onCancel` for Stop button restore
8. `<TextArea>` — add `onFocus={updateContext}`

- [ ] **Step 7: Verify build compiles**

```bash
cd /home/hsy/p/cocalc/src/packages/frontend && npx tsc --noEmit 2>&1 | tail -30
```

Fix any type errors.

- [ ] **Step 8: Run unit tests**

```bash
cd /home/hsy/p/cocalc/src/packages/frontend && npx jest --testPathPattern="notebook-agent-utils" --no-coverage 2>&1 | tail -30
```

Fix any test failures.

- [ ] **Step 9: Commit**

```
notebook-agent: rewrite with context awareness, dual-mode editing, batch insert, confirm-to-run
```

---

## Chunk 5: Integration Testing

### Task 9: Manual integration testing

- [ ] **Step 1: Test context indicator**

Open a .ipynb file. Switch to Assistant tab. Click into a **code cell**, then click the assistant input area. Verify yellow bar shows cell number, type, and line. Select text in a **code cell** — verify the selection text appears in the indicator. Try multi-cell selection (Shift+click) — verify "Cells #N–M selected". Also test with a **markdown cell** — verify only cell number and cursor position appear (no selection text, since markdown/Slate cells don't support it).

- [ ] **Step 2: Test tool usage**

Ask "How many cells?" — verify cell_count tool. Ask "Show me cell #1" — verify get_cell with fenced content. Ask for a range — verify get_cells.

- [ ] **Step 3: Test cell editing**

Small cell: ask to modify — verify set_cell is used. Large cell (1000+ chars): ask to change part — verify edit_cell with search/replace.

- [ ] **Step 4: Test batch insert**

Ask to insert a markdown explanation + code cell after a specific cell. Verify both cells appear in correct order.

- [ ] **Step 5: Test confirm-to-run**

Ask agent to run a cell. Verify blue bar appears. Click Run — verify execution and output. Test Dismiss — verify declined message.

- [ ] **Step 6: Test Stop button**

Start a response, click Stop. Verify input restores last query.

- [ ] **Step 7: Test context from chat frame**

Ensure context works even when the chat frame is the active frame (not the notebook frame). Click into the notebook, select text, then click the assistant input — the yellow indicator should show the notebook context captured before focus switched.

- [ ] **Step 8: Push**

```bash
git push origin claude/add-coding-agent-oyifN
```
