# Notebook Agent: Context-Aware Editing

**Date:** 2026-03-10
**Status:** Approved
**Branch:** claude/add-coding-agent-oyifN

## Summary

Extend the existing Jupyter NotebookAgent with context awareness (focused cell, cursor position, selection), dual-mode cell editing (full replacement for small cells, search/replace patches for large cells), batch cell insertion, and confirm-to-run cell execution.

## Background

The coding agent (for LaTeX, Python files, etc.) already provides rich editor context — visible lines, cursor position, selected text — in its system prompt, plus a context indicator showing the user what the LLM will "see". The notebook agent currently starts blind: it has tools to read/edit cells, but doesn't know which cell the user is looking at or what they've selected. This design brings the notebook agent to parity.

## Tool Set

All indices are **1-based** and **inclusive** for ranges.

| Tool | Args | Purpose |
|------|------|---------|
| `get_cell` | `index` | Read a single cell's input + output |
| `get_cells` | `start, end` | Read a range of cells (both inclusive) |
| `cell_count` | — | Get total number of cells |
| `set_cell` | `index, content` | Full replacement (cells < ~1000 chars) |
| `edit_cell` | `index, edits` | Search/replace patches (cells >= ~1000 chars) |
| `insert_cells` | `after_index, cells_markdown` | Batch insert code + markdown cells |
| `run_cell` | `index` | Execute a cell (user confirms first) |

### Index Stability

Tools categorized as **read-only** (`cell_count`, `get_cell`, `get_cells`) and **mutating** (`set_cell`, `edit_cell`, `insert_cells`, `run_cell`). The tool dispatcher snapshots `cell_list` at the start of a batch, but **re-reads it after any mutating tool** so that subsequent tools in the same batch see correct indices (e.g., `insert_cells` followed by `run_cell` on the new cell).

Indices are 1-based in the LLM interface (matching the context indicator) but converted to 0-based for internal array access.

### Tool Details

**`get_cell(index)` / `get_cells(start, end)`**
- Cell content fenced with `backtickSequence(input, language)` for code cells, `backtickSequence(input, "markdown")` for markdown cells
- Output text included (truncated to 4000 chars)
- Returns: cell type, input, output, execution state

**`set_cell(index, content)`**
- Full replacement via `jupyterActions.set_cell_input(cellId, content, true)`
- Intended for small cells (< ~1000 chars)

**`edit_cell(index, edits)`**
- `edits` is a string containing `<<<SEARCH/>>>REPLACE/<<<END` blocks
- Parsed with `parseSearchReplaceBlocks()` from `coding-agent-utils.ts`
- Applied with `applySearchReplace()` against current cell content
- Returns applied/failed counts

**`insert_cells(after_index, cells_markdown)`**
- `cells_markdown` is a string with alternating fenced code and markdown blocks
- Parsed with `splitCells()` from `insert-cell/split-cells.ts`
- Inserted sequentially using `jupyterActions.insert_cell_adjacent(prevId, +1, true)`, chaining each new cell's ID as the anchor for the next
- `after_index = 0` inserts at the very beginning
- Returns list of new cell indices and IDs

**`run_cell(index)`**
- Does NOT execute immediately
- Adds to `pendingRuns` state array
- User sees confirmation UI: "Run cell #N?" with Run/Dismiss buttons
- On confirm: `jupyterActions.run_cell(cellId, true)`, poll for completion (500ms interval, 120s timeout), return output to LLM
- On dismiss: return "User declined to run this cell" to LLM

## Context Capture

### Snapshot Trigger

When the input area receives focus, snapshot the notebook state (same pattern as coding agent's `updateEditorContext`):

1. **Focused cell**: Find notebook frame via `_get_most_recent_active_frame_id_of_type("jupyter_cell_notebook")`, then `store.get("cur_id")` → resolve to 1-based index
2. **Cell type**: code or markdown
3. **Cell content**: full text of the focused cell
4. **Cursor position**: line number within the cell (via new public `getCursorPosition()` method on `NotebookFrameActions`)
5. **Selected text**: within the cell (via existing public `getCellSelection()` method — works for code cells; markdown cells return empty)
6. **Selection range**: via new public `getSelectionRange()` method on `NotebookFrameActions` — returns `{ fromLine, toLine }` for code cells; not available for markdown cells
7. **Multi-cell selection**: `store.get_selected_cell_ids_list()` → ordered list of all selected cell IDs (includes `cur_id` + `sel_ids`)

**Note:** Markdown cells (Slate editor) currently register only `set_cursor` and `get_cursor` — not `getSelection` or selection bounds. Context capture for markdown cells is limited to cursor position. To support full selection context in markdown cells, the `EditorFunctions` interface and the Slate editor registration would need to be extended (out of scope for this iteration).

### Context Indicator

Yellow bar above input (same styling as coding agent):

| Situation | Indicator text |
|-----------|---------------|
| Cursor in cell, no selection | `Cell #5 (code)` |
| Cursor at specific line | `Cell #5 (code), line 12` |
| Single-line selection | `Cell #5, line 12: "x = np.array(...)"` |
| Multi-line selection in cell | `Cell #5, lines 8–15 selected` |
| Multiple cells selected | `Cells #3–7 selected` |

### Context in System Prompt

On submit, the focused cell's content is included in the system prompt, fenced with `backtickSequence(content, language)`. Cursor position and selection are noted. This gives the LLM immediate context without requiring a `get_cell` tool call.

## System Prompt Structure

Built fresh each turn:

1. **Role**: "You are an AI assistant for a Jupyter notebook."
2. **Kernel info**: `Kernel: "${kernel_name}". Programming language: "${language}".` (from `store.getIn(["kernel_info", ...])`)
3. **Notebook overview**: Total cell count
4. **Focused cell context**: Full content of the focused cell (properly fenced), with cursor/selection info
5. **Tool documentation**: All 7 tools with format examples
6. **Edit rules**:
   - "For cells under 1000 characters, use `set_cell` with full replacement."
   - "For larger cells, use `edit_cell` with `<<<SEARCH/>>>REPLACE/<<<END` blocks."
   - "To insert multiple cells, use `insert_cells` with alternating fenced code/markdown blocks."
7. **Run rules**: "To run a cell, use `run_cell`. The user will confirm before execution."

## UI Layout

Identical structure to coding agent:

```
┌─────────────────────────────────────┐
│ AgentHeader (AI avatar, title,      │
│              model selector)        │
├─────────────────────────────────────┤
│ AgentSessionBar (New, Turns, etc.)  │
├─────────────────────────────────────┤
│                                     │
│ AgentMessages (scrollable)          │
│   - User messages (gray bg)         │
│   - Assistant messages (markdown)   │
│   - System messages (tool results)  │
│                                     │
├─────────────────────────────────────┤
│ Pending runs (blue bar)             │
│   "Run cell #4?" [Run] [Dismiss]    │
├─────────────────────────────────────┤
│ Context indicator (yellow bar)      │
│   "Cell #3 (code), line 5"         │
├─────────────────────────────────────┤
│ AgentInputArea (textarea + buttons) │
└─────────────────────────────────────┘
```

## File Structure

**Modify (notebook editor layer):**
- `src/packages/frontend/frame-editors/jupyter-editor/cell-notebook/actions.ts` — extend `EditorFunctions` interface with `getSelectionRange?()`, add `getCursorPosition()` and `getSelectionRange()` public methods to `NotebookFrameActions`
- `src/packages/frontend/jupyter/codemirror-editor.tsx` — wire `getSelectionRange` in editor registration using CM's `getCursor("from")`/`getCursor("to")`

**Modify (agent):**
- `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent.tsx` — main rewrite

**Create:**
- `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.ts` — system prompt builder, tool dispatcher, context extraction, cell content fencing
- `src/packages/frontend/frame-editors/jupyter-editor/notebook-agent-utils.test.ts` — unit tests for pure utility functions

**Reuse (import):**
- `jupyter/llm/split-cells.ts` → `splitCells()` for batch insert parsing
- `llm/coding-agent-utils.ts` → `parseSearchReplaceBlocks()`, `applySearchReplace()` for large-cell patches
- `markdown/util.ts` → `backtickSequence()` for proper content fencing
- `llm/agent-base/` → all shared UI components (unchanged)

**No changes to:**
- `agent-base/` components
- `generic/chat.tsx` (already routes `.ipynb` → `NotebookAgent`)
- `coding-agent*.ts` files

## Component State

Notebook-specific state in the component:

- `pendingRuns: { cellIndex: number, cellId: string }[]` — cells awaiting user confirmation to run
- `editorContextLabel: string` — context indicator text
- `notebookContextRef` — snapshot of focused cell, cursor, selection (taken on input focus)

## Dual-Mode Editing Threshold

Cells under ~1000 characters use `set_cell` (full replacement). Cells at or above 1000 characters use `edit_cell` (search/replace patches). The system prompt documents this threshold so the LLM chooses appropriately. The `edit_cell` tool reuses `parseSearchReplaceBlocks()` and `applySearchReplace()` from the coding agent.

## Cell Content Fencing

All cell content shown to the LLM (in system prompt, tool results, etc.) is fenced using `backtickSequence()` from `markdown/util.ts`:
- Code cells: `backtickSequence(content, language)` where `language` comes from `kernel_info`
- Markdown cells: `backtickSequence(content, "markdown")`

This prevents the LLM from confusing cell content with tool block delimiters.
