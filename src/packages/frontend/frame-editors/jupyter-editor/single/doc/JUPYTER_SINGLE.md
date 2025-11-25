# Jupyter Single-File View (jupyter_single)

Compact overview of the CodeMirror-based single-document editor that powers the notebook preview/edit experience.

## Purpose

- Presents an entire notebook as one document for fast navigation, search, and editor-style workflows.
- Keeps the existing Jupyter store authoritative; every edit is mirrored back through notebook actions.
- Renders outputs and insert-cell affordances inline without breaking the text flow.

## Architecture Snapshot

- **Document model**: Every code/raw cell contributes its source lines directly to the CodeMirror doc. A zero-width-space (ZWS) marker line follows each cell and acts as the placeholder for output or markdown widgets. Markdown cells skip source lines and rely solely on the marker.
- **Cell mappings**: `buildDocumentFromNotebook` records `inputRange`, `outputMarkerLine`, metadata, and outputs for every cell. These mappings are kept in a ref so filters, gutters, and widgets can translate between document positions and notebook IDs.
- **Live realignment**: User edits shift marker positions before the store has a chance to sync. `realignMappingsWithDocument` recalculates line ranges from the current document whenever the doc changes, preventing drift in gutters or widget placement.
- **Outputs**: `OutputWidget` replaces the marker line with a React-rendered output block plus the insert-cell widget. Widgets request CodeMirror measurements after render to keep scroll height accurate.
- **Gutter**: `createCellGutterWithLabels` displays `In[ ]` / `Out[N]` labels, run-state indicators, and input-only line numbers. Output marker lines still reserve gutter space so widgets stay aligned.
- **Filters & effects**:
  - Marker protection blocks partial edits of ZWS lines.
  - Cell merging reacts only to newline deletions at true boundaries so normal typing/backspacing never merges cells.
  - Range deletion, paste detection, and execution key handler effects translate CodeMirror operations into notebook actions.
  - Selection tracking highlights entire output widgets when a selection crosses their markers while still allowing normal selection inside a widget when the range stays local.
- **Store listener**: Rebuilds the document from notebook data, preserves unsynced edits, and dispatches targeted `outputsChangedEffect` updates so decorations re-render only when required. When content replacement occurs, pending mappings are swapped in immediately after the dispatch, keeping gutters/output widgets aligned.

## Recent Updates

- **Output selection UX**: Cross-cell selections add `jupyter-cell-widget-selected` to related widgets. CSS removes the default text highlight inside the widget, so selections show a single blue background around the entire output. Selecting text inside a widget still uses native highlighting.
- **Error styling**: `ERROR_STYLE` became a CSS class shared between history and single-file views, ensuring consistent output banners.
- **Cell merge guardrails**: Backspacing at the end of a cell now trims the character instead of merging with the next cell unless the newline itself is removed. Tests cover both first/last character deletions.
- **Mapping realignment**: A lightweight pass recalculates `inputRange` / `outputMarkerLine` after every doc change. This eliminated the brief duplicate `Out[N]` gutter entries that appeared after inserting blank lines at the end of a cell.

## Editing & Sync Workflow

1. User edits mutate the CodeMirror doc immediately. Unsynced cells are tracked so their text can be preserved if the store refreshes mid-edit.
2. Debounced flush (500 ms) or explicit actions (Shift+Return, run commands) call the notebook actions to store the updated `input`.
3. Store changes rebuild the document. If the rebuild replaces the entire doc, the next selection refresh re-applies widget highlighting and repositions gutters via the pending mappings cache.

## Patch-Based Updates (Critical Design Constraint)

**Problem:** A race condition occurred when the user continued typing after `flushEditsToStore()` but before the store listener's document rebuild fired. The full document replacement would overwrite newly-typed content, causing loss of input and cursor jumping.

**Solution:** Use diff-based patch updates instead of full document replacement:

1. **Extract unsynced edits** (editor.tsx:685-703): Before rebuilding, extract the current local content from the CodeMirror document for any cells in `unsyncedCellsRef`. This captures typing that happened after the flush but before the store update.

2. **Preserve local content** (state.ts:74-100): Pass extracted local inputs to `buildDocumentFromNotebook()` via the optional `localInputs` parameter. Unsynced cells use their local content instead of store content.

3. **Apply targeted changes** (editor.tsx:611-656): Use Google Diff-Match-Patch (`diff_main`) to compute only the changes between old and new document content. Apply these incrementally via CodeMirror 6's `changes` API instead of full replacement.

4. **Preserve cursor/scroll/history** (editor.tsx:801-834): Incremental changes automatically preserve:
   - Cursor position (no full replacement = no jump)
   - Scroll position (maintained by CodeMirror)
   - Undo/redo history (targeted changes don't break history)

5. **Fallback to full replacement** (editor.tsx:810-826): If the diff has ≥500 chunks (rare edge case, e.g., formatting entire file), fall back to full replacement for safety.

**Inspired by:** `packages/frontend/codemirror/extensions/set-value-nojump.ts` (CodeMirror 5's proven approach for preserving editor state during value updates).

## Testing & Validation

- Unit tests in `packages/frontend/frame-editors/jupyter-editor/single/__tests__/editor.test.ts` cover document building, marker handling, merge filters, mapping realignment, and helper utilities.
- `__tests__/full.test.ts` exercises the full merge workflow against mocked notebook actions.
- Running `pnpm test -- --runTestsByPath frame-editors/jupyter-editor/single/__tests__/ --runInBand` validates the suite headlessly.

## Maintenance Tips

- Always update `state.ts`, `filters.ts`, and the doc-building pipeline together when adjusting marker semantics.
- When changing output rendering, ensure `OutputWidget` continues to request a measurement so CodeMirror recomputes layout.
- New features should add tests to the existing suites instead of embedding code snippets here; the doc stays focused on design intent.
