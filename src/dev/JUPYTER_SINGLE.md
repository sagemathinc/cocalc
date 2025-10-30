# Jupyter Single-File View (jupyter_single)

**Complete consolidated documentation for the Jupyter single-file view architecture and implementation.**

## Table of Contents

1. [Overview](#overview)
2. [Motivation](#motivation)
3. [Architecture](#architecture)
4. [Implementation Details](#implementation-details)
5. [Output Widget Design](#output-widget-design)
6. [Multi-Cell Type Support](#multi-cell-type-support)
7. [Marker Line Protection](#marker-line-protection)
8. [CodeMirror 6 Setup](#codemirror-6-setup)
9. [Technical Decisions](#technical-decisions)
10. [Cell Mapping Algorithm](#cell-mapping-algorithm)
11. [Handling Edge Cases](#handling-edge-cases)
12. [Testing Strategy](#testing-strategy)
13. [Migration & Adoption](#migration--adoption)
14. [Future Enhancements](#future-enhancements)
15. [Glossary](#glossary)

---

## Overview

This document describes the architecture and implementation of a new **single-file view** of Jupyter notebooks. Unlike the traditional cell-based view (`jupyter_cell_notebook`), this view presents the entire notebook as a single CodeMirror 6 document, where cells are mapped to line ranges and outputs are rendered as inline widgets.

## Motivation

The traditional notebook view excels at interactive cell-by-cell editing but can feel fragmented when viewing the notebook as a cohesive whole. A single-file view enables:

- **Linear reading flow**: Read the notebook top-to-bottom like a document
- **Familiar editor experience**: Works like a code editor with line numbers and standard navigation
- **Code navigation**: Use find/goto-line and other standard editor features
- **Efficient for large notebooks**: Single document for faster navigation and search
- **Flexible output rendering**: Display outputs as interactive inline elements

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────┐
│          Jupyter Single-File View                    │
│  (jupyter_single editor in frame-tree)               │
└─────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
    ┌───▼────┐    ┌────▼────┐    ┌────▼────┐
    │ Jupyter│    │CodeMirror   │ Display │
    │ Store  │    │   6 Doc │    │Widgets │
    │(Cells) │    │(Lines)  │    │(Output)│
    └────────┘    └─────────┘    └────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                  ┌─────▼─────┐
                  │ Sync Layer │
                  │ (bidirectional)
                  └───────────┘
```

### Key Components

#### 1. **Data Model: Cell → Document Mapping**

Each cell in the Jupyter notebook is mapped to a range of lines in the CodeMirror document:

```typescript
interface CellMapping {
  cellId: string;
  cellType: CellType; // "code" | "markdown" | "raw"

  // Input mapping
  inputRange: {
    from: number; // line number (0-indexed)
    to: number;
  };

  // Output marker line
  outputMarkerLine: number; // line number of ZWS marker

  // Source and outputs
  source: string[];
  metadata?: Record<string, any>;
  outputs?: NotebookOutput[];
}
```

#### 2. **Document Structure**

The CodeMirror document is structured as follows:

```
Line 0-N:    Cell 1 Input (code, markdown, or raw)
(marker):    Cell 1 Output (widget) - invisible ZWS marker

Line N+1-M:  Cell 2 Input
(marker):    Cell 2 Output - invisible ZWS marker

...
```

- **Input cells**: Raw text content (code or markdown)
- **Output markers**: CodeMirror widgets placed at the end of each cell's input
  - Display execution results, error messages, plots, HTML, etc.
  - Rendered as DOM elements via CodeMirror's widget system
  - Protected from deletion by change filter

#### 3. **Core Components**

##### `single.tsx` (Main Component)

- Frame tree wrapper component
- Renders kernel status bar
- Manages kernel selector modal
- Passes actions to editor component

##### `editor.tsx` (CodeMirror 6 Editor)

- CodeMirror 6 editor setup with extensions
- Python syntax highlighting
- Line numbers with custom gutter
- Cell input rendering
- Store change listener for reactive updates

##### `state.ts` (Document Building)

- Manages CodeMirror document state
- Builds and maintains cell-to-line mappings
- Provides utilities for converting between line numbers and cell IDs
- Tracks which cells have outputs

##### `output.tsx` (Output Widget Rendering)

- `OutputWidget` class implementing CodeMirror's WidgetType
- Renders outputs using existing `CellOutputMessage` component
- Supports all output types: stream, data, error, images
- React roots properly managed with microtask deferred unmounting

##### `decorations.ts` (Decoration State Management)

- `createOutputDecorationsField()`: StateField for decoration management
- `outputsChangedEffect`: StateEffect to signal which cells changed
- Decoration cache: Reuses widgets for unchanged cells
- Only recomputes decorations when `outputsChangedEffect` fired

##### `filters.ts` (Marker Protection)

- `createMarkerProtectionFilter()`: Prevents deletion of output marker lines
- Uses Zero-Width Space (U+200B) as invisible markers
- ChangeFilter blocks modifications to marker ranges

##### `cell-gutter.ts` (Custom Gutter)

- `createCellGutterWithLabels()`: Custom gutter showing both labels and line numbers
- Displays `In[N]` labels (blue) on first line of each cell
- Displays `Out[N]` labels (red) on last line of cells with outputs
- Consecutive line numbering that skips invisible marker lines

### Implementation Phases

#### Phase 1: Read-Only Implementation (COMPLETE)

**Goal**: Display the notebook as a read-only CodeMirror document.

**Status**: ✅ Complete - Read-only document rendering with full store sync

**Steps**:

1. Create the component structure
2. Build cell-to-line mapping from Jupyter store
3. Render inputs as CodeMirror document
4. Render outputs as inline widgets
5. Handle updates from Jupyter store

#### Phase 2: Output Widgets & Sync Optimization (COMPLETE)

**Goal**: Optimize output rendering and implement efficient updates.

**Status**: ✅ Complete - Implemented multi-layer optimization

**What Changed From Original Plan**:

The core challenge was **excessive DOM updates** on every store change. We implemented:

1. **Line-by-line diffing** instead of full cell replacement:
   - Compare cell inputs line-by-line, not character-by-character
   - Only generate changes for lines that actually differ
   - Reduces changes dispatched to CodeMirror dramatically

2. **StateEffect signaling** to avoid decoration recomputation:
   - Input text changes only map decorations to new positions (cheap)
   - Output changes dispatched via `outputsChangedEffect` only when needed
   - Decorations field only recomputes when explicitly signaled

3. **Decoration caching per cell**:
   - Cache `OutputWidget` instances by cell ID
   - On output change, only recreate widgets for cells with changed outputs
   - Reuse cached decorations for unchanged cells
   - Massive reduction in DOM updates

#### Phase 3: Interactive Outputs & Full Feature Parity (PLANNED)

**Goal**: Match all features of the cell-based view.

**Steps**:

1. Make output widgets interactive (click to expand, zoom images, etc.)
2. Implement cell type indicators (visual badges, syntax highlighting hints)
3. Cell toolbar in a side panel or popup
4. Metadata editing
5. Output manipulation (clear, scroll, etc.)

---

## Output Widget Design

### Cell ID-Based Approach with Zero-Width Markers

#### Core Concept

Each Jupyter cell already has a unique `id` field (e.g., `"6ead4e"`). We use this directly instead of UUIDs:

```json
{
  "cell_type": "code",
  "id": "6ead4e",
  "source": ["print('hello')"],
  "outputs": [
    {
      "output_type": "stream",
      "name": "stdout",
      "text": ["hello\n"]
    }
  ]
}
```

#### Invisible Marker: Zero-Width Space (U+200B)

Instead of a visible marker character, we use a **completely invisible** marker:

- **Character**: Zero-Width Space (U+200B)
- **UTF-8 bytes**: `e2 80 8b` (3 bytes, 1 character)
- **Visibility**: Completely invisible (no glyph rendered)
- **Purpose**: Designed specifically for marking/bookmarking text without affecting display
- **Detection**: Can be found via regex or string search, won't interfere with user text

#### Document Structure Example

```
[cell 1 source line 1]
[cell 1 source line 2]
[ZWS marker line]     ← Single U+200B character (invisible)
[cell 2 source line 1]
[cell 2 source line 2]
[ZWS marker line]     ← Single U+200B character (invisible)
```

### Implementation: Output Decoration System

#### 1. Update `buildDocumentFromNotebook()` in state.ts

```typescript
// In state.ts
const ZERO_WIDTH_SPACE = "\u200b"; // U+200B - invisible marker

export function buildDocumentFromNotebook(
  cells: Map<string, any>,
  cellList: List<string>,
): DocumentData {
  const lines: string[] = [];
  const mappings: CellMapping[] = [];
  let currentLine = 0;

  for (const cellId of cellList) {
    const cell = cells.get(cellId);
    if (!cell) continue;

    const cellType = cell.get("cell_type") ?? "code";
    const source = cell.get("source");
    const outputs = cell.get("outputs")?.toJS?.() ?? [];

    let sourceLines: string[] = [];
    if (Array.isArray(source)) {
      sourceLines = source;
    } else if (typeof source === "string") {
      sourceLines = source.split("\n");
    }

    // Store mapping with cell info
    const inputRange = {
      from: currentLine,
      to: currentLine + sourceLines.length,
    };

    mappings.push({
      cellId,
      cellType,
      inputRange,
      outputMarkerLine: currentLine + sourceLines.length,
      source: sourceLines,
      metadata: cell.get("metadata")?.toJS?.() ?? {},
      outputs,
    });

    // Add source lines
    lines.push(...sourceLines);
    currentLine += sourceLines.length;

    // Add invisible marker line (single ZWS character)
    lines.push(ZERO_WIDTH_SPACE);
    currentLine += 1;
  }

  const content = lines.join("\n");
  return { content, mappings };
}
```

#### 2. Create Output Widget Class

```typescript
import { WidgetType } from "@codemirror/view";

/**
 * Widget that renders notebook outputs.
 * Replaces the invisible ZWS marker line.
 */
class OutputWidget extends WidgetType {
  constructor(
    private cellId: string,
    private outputs: any[],
    private cellType: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "jupyter-output-widget";
    container.setAttribute("data-cell-id", this.cellId);

    // Only render outputs for code cells
    if (this.cellType !== "code" || !this.outputs?.length) {
      return container;
    }

    for (const output of this.outputs) {
      const outputDiv = this.renderOutput(output);
      container.appendChild(outputDiv);
    }

    return container;
  }

  private renderOutput(output: any): HTMLElement {
    const div = document.createElement("div");
    div.className = "jupyter-output-item";

    switch (output.output_type) {
      case "stream":
        div.className += " output-stream";
        div.style.fontFamily = "monospace";
        div.style.whiteSpace = "pre-wrap";
        div.textContent = output.text?.join("") ?? "";
        break;

      case "display_data":
        div.className += " output-display";
        if (output.data?.["text/html"]) {
          div.innerHTML = output.data["text/html"].join("");
        } else if (output.data?.["text/plain"]) {
          div.style.fontFamily = "monospace";
          div.textContent = output.data["text/plain"].join("");
        }
        break;

      case "execute_result":
        div.className += " output-result";
        if (output.data?.["text/html"]) {
          div.innerHTML = output.data["text/html"].join("");
        } else if (output.data?.["text/plain"]) {
          div.style.fontFamily = "monospace";
          div.textContent = output.data["text/plain"].join("");
        }
        break;

      case "error":
        div.className += " output-error";
        div.style.color = "#d73a49";
        div.style.fontFamily = "monospace";
        const trace = output.traceback?.join("\n") ?? output.ename;
        div.textContent = trace;
        break;

      default:
        div.textContent = `[${output.output_type}]`;
    }

    return div;
  }

  ignoreEvent(): boolean {
    return true; // Read-only, don't bubble events
  }
}
```

#### 3. Create Output Decoration StateField

```typescript
import { Decoration, EditorView, StateField, RangeSet } from "@codemirror/view";
import { EditorState } from "@codemirror/state";

/**
 * Compute output decorations for all cells with outputs.
 */
function computeOutputDecorations(
  state: EditorState,
  mappings: CellMapping[],
): RangeSet<Decoration> {
  const decorations: Array<{
    range: [number, number];
    decoration: Decoration;
  }> = [];

  for (const mapping of mappings) {
    const { cellId, outputs, cellType, outputMarkerLine } = mapping;

    // Skip if no outputs
    if (!outputs?.length) {
      continue;
    }

    // Find the position of the ZWS marker line in the document
    const line = state.doc.line(outputMarkerLine + 1); // +1 because line numbers are 1-indexed
    const from = line.from;
    const to = line.to;

    // Create decoration that replaces the ZWS line with output widget
    const decoration = Decoration.replace({
      widget: new OutputWidget(cellId, outputs, cellType),
      block: true, // Full-width block
      inclusive: true,
      side: -1, // Place before the line
    });

    decorations.push({
      range: [from, to],
      decoration,
    });
  }

  // Build RangeSet from decorations
  return RangeSet.of(
    decorations.map(({ range: [from, to], decoration }) =>
      decoration.range(from, to),
    ),
    true, // sorted
  );
}

/**
 * StateField for managing output decorations.
 */
const outputDecorationsField = StateField.define<RangeSet<Decoration>>({
  create(state) {
    // Will be populated by view plugin
    return RangeSet.empty;
  },

  update(decorations, tr) {
    // When document changes, recompute decorations
    if (tr.docChanged) {
      // Get current mappings from somewhere
      const mappings = getMappingsFromState(tr.state);
      return computeOutputDecorations(tr.state, mappings);
    }

    // Otherwise, map decorations to new positions
    return decorations.map(tr.changes);
  },

  provide: (f) => EditorView.decorations.from(f),
});
```

### Key Advantages

✅ **Cell ID Based**: Direct use of Jupyter's native `cell.id` field

- No need for synthetic UUIDs
- Matches notebook structure
- Easy to correlate with Jupyter actions

✅ **Completely Invisible**: Zero-Width Space (U+200B) marker

- No visual clutter in the editor
- Users won't accidentally see markers
- Can't be confused with real content
- Still detectable programmatically

✅ **Immutable Marker Line**:

- `Decoration.replace()` prevents user editing
- Protected by change filter (see below)
- Automatically handled by CodeMirror

✅ **Block-Level Rendering**:

- Full editor width
- Proper spacing with other content
- Can be scrolled naturally

✅ **Efficient Updates**:

- RangeSet automatically maps positions through document changes
- Only recompute on notebook changes
- StateField handles updates automatically

---

## Multi-Cell Type Support

### Overview

The single-file view supports three cell types: **code**, **markdown**, and **raw**. While code cells display inline in the CodeMirror document (with output widgets below), markdown and raw cells are rendered as specialized widgets that replace their marker lines.

### Type-Specific Markers

To differentiate cell types while maintaining the invisible marker approach, we use **type-specific marker characters**:

```
${ZWS}c    → Code cell marker (renders output widget)
${ZWS}m    → Markdown cell marker (renders markdown widget)
${ZWS}r    → Raw cell marker (renders plaintext widget)
```

**Example document structure:**

```
print('hello')
x = 42
⁠c                        ← ${ZWS}c marker (invisible, signals code cell)
[Output Widget]

⁠m                        ← ${ZWS}m marker (invisible, signals markdown cell)
[Markdown Display/Edit Widget showing: # Markdown Title, Some content here]

⁠r                        ← ${ZWS}r marker (invisible, signals raw cell)
[Raw Widget: Raw cell content]
```

**Key Detail**: Markdown and raw cell **source lines are NOT added to the document**. Only the marker line is in the document, and the widget decoration displays the entire cell content.

- Code cells: source lines visible + marker line
- Markdown cells: **no source lines** + marker line only
- Raw cells: **no source lines** + marker line only

### Cell Type Determination

Cell type is read from the notebook data during document building:

```typescript
// In state.ts - buildDocumentFromNotebook()
const cellType = cell.get("cell_type") ?? "code"; // Read actual cell_type
const markerChar =
  cellType === "markdown" ? "m" : cellType === "raw" ? "r" : "c";
lines.push(`${ZERO_WIDTH_SPACE}${markerChar}`);
```

### Markdown Cells: Display and Edit Modes

#### Display Mode (Default)

When a markdown cell is NOT being edited:

- Rendered using `MostlyStaticMarkdown` component
- Shows formatted markdown with:
  - Syntax highlighting (bold, italic, code blocks, etc.)
  - Task list checkboxes (clickable)
  - Math rendering
  - Links and embeds
- Double-click anywhere in the widget to enter edit mode
- Click checkbox to toggle task item

#### Edit Mode

When a markdown cell is being edited (after double-click):

- Rendered using `MarkdownInput` component (from `packages/frontend/editors/markdown-input/`)
- Provides two editing modes:
  - **Markdown mode**: PlainText CodeMirror editor
  - **Editor mode**: WYSIWYG Slate-based visual editor
  - User can toggle between modes
- Save button (Edit/Save) at top right to exit edit mode
- **Keyboard**:
  - **Shift+Return**: Save and exit edit mode
  - **Return**: Insert newline (does NOT exit edit mode)
  - **Escape**: Exit edit mode without saving (optional)
- Content synced to cell data on save

#### Edit State Management

Edit state is tracked per-cell using a `Set<string>` of cell IDs in `editor.tsx`, with toggle callbacks dispatched to decorations for updates.

### Raw Cells

Raw cells are similar to markdown cells but without special rendering:

- Displayed as plaintext (no syntax highlighting)
- Double-click to enter edit mode (if editable)
- No outputs (like markdown cells)
- Used for notebook metadata and non-executable content

### Implementation Status

✅ **IMPLEMENTED** - All multi-cell type support is now implemented in the codebase:

**Source files:**

- `packages/frontend/frame-editors/jupyter-editor/single/state.ts` - Document building with cell type handling
- `packages/frontend/frame-editors/jupyter-editor/single/markdown-widgets.tsx` - Widget classes for markdown/raw cells
- `packages/frontend/frame-editors/jupyter-editor/single/decorations.ts` - Decoration rendering for all cell types
- `packages/frontend/frame-editors/jupyter-editor/single/editor.tsx` - Edit state management
- `packages/frontend/frame-editors/jupyter-editor/single/cell-gutter.ts` - Cell type-specific gutter labels

**Key implementation details:**

- Markdown and raw cell source lines are NOT added to the document (only marker lines)
- Edit state managed via `mdEditIds` Set in component state
- Widget decorations handle display/edit mode toggling
- Gutter shows appropriate labels based on cell type

### Component Reuse

These components are reused from the regular Jupyter implementation:

- **`MarkdownInput`** (`packages/frontend/editors/markdown-input/multimode.tsx`)
  - Dual-mode editor (WYSIWYG + plaintext)
  - Handles Shift+Enter and keyboard shortcuts
  - Supports mentions and collaborative editing features

- **`MostlyStaticMarkdown`** (`packages/frontend/editors/slate/mostly-static-markdown.tsx`)
  - Renders markdown with math, checkboxes, embeds
  - Clickable checkbox items
  - Supports CoCalc-specific markdown extensions

### Keyboard Shortcuts Summary

| Action            | Shortcut                    | Behavior                             |
| ----------------- | --------------------------- | ------------------------------------ |
| **Edit markdown** | Double-click widget         | Enter edit mode, show MarkdownInput  |
| **Save & exit**   | Shift+Return (in edit mode) | Save content, switch to display mode |
| **Newline**       | Return (in edit mode)       | Insert newline, stay in edit mode    |
| **Execute code**  | Shift+Return (in code cell) | Execute cell (existing behavior)     |

### No Outputs for Markdown/Raw Cells

- Markdown and raw cells never have outputs, even if present in notebook JSON
- Only the marker line exists in the document (no source lines visible)
- Widget decoration renders the cell content (markdown or raw plaintext)
- Gutter shows no `Out[N]` label for markdown/raw cells

### Key Implementation Details

**Document Structure Differences by Cell Type:**

| Cell Type | In Document                | Widget Renders                  |
| --------- | -------------------------- | ------------------------------- |
| Code      | Source lines + marker line | Output widget                   |
| Markdown  | **Marker line ONLY**       | Display or edit markdown widget |
| Raw       | **Marker line ONLY**       | Plaintext widget                |

**Why no source lines for markdown/raw?**

- Markdown/raw cells are complex enough to need widgets (not inline editing)
- Source lines should not be visible - only the widget matters
- Much simpler than trying to hide source lines with decorations
- Widget has full access to source text from `mapping.source`

---

## Marker Line Protection

### The Problem: Can Users Delete Output Widgets?

**Without protection: YES, they can.**

`Decoration.replace()` only affects the visual display:

- ✅ Hides the underlying ZWS character visually
- ✅ Displays the output widget in its place
- ❌ The ZWS character is still in the document state
- ❌ Users can select, delete, or overwrite the marker line
- ❌ When deleted, the decoration disappears but notebook structure is broken

### Solution: EditorState.changeFilter

CodeMirror 6's `changeFilter` facet lets us intercept every transaction (keystroke, deletion, paste, etc.) and:

1. **Return `true`** → allow all changes
2. **Return `false`** → block entire transaction
3. **Return `[num, num, num, num, ...]`** → suppress changes in specific ranges
   - Format: `[start1, end1, start2, end2, ...]`
   - Changes that overlap these ranges are suppressed (silently ignored)

### Implementation: Marker Protection Filter

```typescript
import { EditorState, Transaction, changeFilter } from "@codemirror/state";
import type { CellMapping } from "./state";

const ZERO_WIDTH_SPACE = "\u200b";

/**
 * Create a transaction filter that protects marker lines from deletion.
 *
 * This prevents users from:
 * - Deleting marker lines
 * - Overwriting marker lines
 * - Selecting across marker boundaries
 *
 * The filter returns the protected ranges where changes are suppressed.
 */
function createMarkerProtectionFilter(
  mappingsRef: React.MutableRefObject<CellMapping[]>,
): Extension {
  return changeFilter.of((tr: Transaction) => {
    // Build list of protected ranges (marker lines)
    const protectedRanges: [number, number][] = [];

    for (const mapping of mappingsRef.current) {
      // outputMarkerLine is 0-indexed line number
      // Convert to position in document
      const markerLineNum = mapping.outputMarkerLine;
      const line = tr.newDoc.line(markerLineNum + 1); // +1: 0-indexed → 1-indexed

      // Protect the entire line including newline
      protectedRanges.push([line.from, line.to]);
    }

    if (protectedRanges.length === 0) {
      return true; // No markers to protect
    }

    // Check if any change overlaps protected ranges
    let hasConflict = false;
    for (const change of tr.changes) {
      for (const [start, end] of protectedRanges) {
        // Does this change overlap with protected range?
        if (change.from < end && change.to > start) {
          hasConflict = true;
          break;
        }
      }
      if (hasConflict) break;
    }

    // If no conflicts, allow all changes
    if (!hasConflict) {
      return true;
    }

    // If conflicts, return flattened protected ranges to suppress them
    const flatRanges: number[] = [];
    for (const [start, end] of protectedRanges) {
      flatRanges.push(start, end);
    }
    return flatRanges;
  });
}
```

### Integration with Editor

```typescript
export const SingleFileEditor = React.memo(function SingleFileEditor(
  props: Props
): Rendered {
  const mappingsRef = useRef<CellMapping[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Update document when notebook changes
  useEffect(() => {
    const cells = store.get_ipynb();
    const cellList = store.get_cell_list();

    if (!cells || !cellList) return;

    const { content, mappings } = buildDocumentFromNotebook(cells, cellList);
    mappingsRef.current = mappings;

    if (!containerRef.current) return;

    // Create editor with protection filter
    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle),
        python(),
        EditorView.editable.of(false), // Phase 1: read-only
        outputDecorationsField,
        createMarkerProtectionFilter(mappingsRef), // ← Add protection
      ],
    });

    // Create view
  }, [notebookVersion, store]);

  return (
    <div ref={containerRef} className="jupyter-single-editor">
      {/* CodeMirror renders here */}
    </div>
  );
});
```

### Performance Characteristics

#### O(n) Complexity Per Transaction

```typescript
// For each transaction:
for (const change of tr.changes) {
  // O(m) - usually 1-2
  for (const [start, end] of protectedRanges) {
    // O(n) - number of cells
    if (change.from < end && change.to > start) {
      // O(1) range check
      // conflict found
    }
  }
}
```

- **m** = number of changes in transaction (typically 1-5)
- **n** = number of cells (typically 10-100)
- **Complexity**: O(m × n) = essentially O(n) for single keystroke

**Performance**: <1ms for 1000 cells per keystroke (acceptable)

### Edge Cases & Solutions

#### 1. Deletion Spanning Multiple Cells

User tries: select from cell 1, delete through cell 2
**Result**: Marker lines are protected; only input lines deleted

#### 2. Find & Replace Across Document

User: Find "print" in entire document, replace with "log"
**Result**: Replacements happen in input cells; marker lines are skipped

#### 3. Large Paste Operation

User: Pastes 100 lines of code
**Result**: Paste proceeds; if it crosses a marker, that part is suppressed

#### 4. Undo/Redo

User: Edits → tries to delete marker → blocked
**Result**: Filter applies to all transactions, including undo/redo

### Relationship to Decoration.replace()

**Clear separation of concerns:**

| Component                 | Responsibility                      |
| ------------------------- | ----------------------------------- |
| `Decoration.replace()`    | Visual rendering of output widget   |
| `OutputWidget WidgetType` | DOM structure and content of widget |
| `changeFilter`            | Protection of underlying document   |

They work together:

1. **changeFilter** prevents deletion of marker positions
2. **Decoration.replace()** hides marker visually and shows widget
3. Combined: users see interactive output, can't break structure

---

## CodeMirror 6 Setup

### Summary

The Jupyter single-file view (`jupyter_single`) uses **CodeMirror 6** alongside existing **CodeMirror 5** editors. They coexist without conflicts due to different package names (`codemirror` vs `@codemirror/*`).

### Dependencies

Added to `packages/frontend/package.json`:

```json
"@codemirror/state": "^6.4.1",
"@codemirror/view": "^6.26.3",
"@codemirror/basic-setup": "^0.20.0",
"@codemirror/lang-python": "^6.1.6",
"@codemirror/lang-markdown": "^6.2.3"
```

### File Organization

All CodeMirror 6 code is in `packages/frontend/frame-editors/jupyter-editor/single/`:

```
single/
├── single.tsx          - Frame tree wrapper component
├── editor.tsx          - CodeMirror 6 editor component
├── state.ts            - Document building and cell mappings
├── output.tsx          - Output widget rendering
├── decorations.ts      - Decoration state field and caching
├── filters.ts          - Marker line protection filter
└── cell-gutter.ts      - Custom gutter with cell labels
```

### Usage Example

```typescript
const state = EditorState.create({
  doc: content,
  extensions: [
    basicSetup,
    python(),
    createMarkerProtectionFilter(mappingsRef),
    outputDecorationsField,
  ],
});

const view = new EditorView({
  state,
  parent: containerRef.current,
});
```

### Bundle Impact

- CodeMirror 6: ~250KB gzipped (loaded only when single-file view is used)
- Acceptable for a major new feature

### Build Process

1. `pnpm install` resolves CM6 dependencies
2. TypeScript handles both versions (different module names)
3. Bundler includes both libraries
4. No runtime conflicts

### Coexistence with CodeMirror 5

CodeMirror 5 and 6 coexist due to different package structures:

- **CodeMirror 5**: `codemirror` package with flat structure
- **CodeMirror 6**: `@codemirror/*` scoped packages with composable architecture

TypeScript and bundlers handle both automatically.

### Troubleshooting

- **Module not found**: Run `pnpm install` in repo root
- **Editor doesn't appear**: Check browser console for JS errors
- **Build fails**: Ensure modern JavaScript (ES2020+) support

### Migration Path

If CodeMirror 5 is ever upgraded:

1. Existing editors continue using CM5
2. Single-file view can upgrade independently
3. Eventually migrate all editors (separate effort)

---

## Technical Decisions

### Why CodeMirror 6?

- **Composable**: Excellent widget system for embedding custom content
- **Performant**: Efficient for large documents
- **Modern**: Well-maintained, used throughout CoCalc
- **Extensible**: Easy to add custom extensions and behaviors

### Widget-Based Outputs (vs. Folding)

- **Widgets**: Allow interactive, rich output rendering
- **Folding**: Would hide outputs from view; less suitable for a "document" view

### Line-Based Mapping (vs. Offset-Based)

- **Lines**: More intuitive and matches Jupyter's line-based cell boundaries
- **Offsets**: More flexible but harder to reason about

### Block-Level Decorations for Output Widgets

- **Why**: Output widgets can be taller than a single line, so CodeMirror needs to know
- **How**: Set `block: true` on output widget decorations tells CodeMirror to adjust line height
- **Result**: Gutter height calculations include the full output widget height, preventing misalignment

---

## Cell Mapping Algorithm

Each cell occupies a range of lines in the document:

- Input lines: `inputRange.from` to `inputRange.to`
- Output marker line: `outputMarkerLine` (ZWS character, always present)
- Mapping: `{ cellId, cellType, inputRange, outputMarkerLine, source, outputs }`

### Key Behavior for Cells Without Outputs

- Even cells without outputs get an output marker line in the document (invisible ZWS character)
- This ensures consistent document structure and proper widget placement
- The Out[N] label is shown on the last line of ALL input cells (including those without outputs)
- Out[N] labels for cells without outputs appear with the same styling as cells with outputs
- The OutputWidget renders as an empty div for cells with no outputs

---

## Handling Edge Cases

### Scenario 1: Cell with No Trailing Newline

**Problem**: Last cell doesn't end with `\n`
**Solution**: Normalize cell source to always end with `\n` when building mappings

### Scenario 2: User Selects Content Across Cell Boundaries

**Problem**: Multi-cell selection in editor
**Solution**: Determine which cells are affected, select corresponding cells in notebook

### Scenario 3: External Changes (e.g., kernel execution)

**Problem**: Notebook state changes externally (outputs updated)
**Solution**: Listen to Jupyter store changes, update markers incrementally

### Scenario 4: Large Notebooks

**Problem**: Document becomes very large, performance degrades
**Solution**: Consider lazy-loading outputs or virtualizing widget rendering

---

## Testing Strategy

- **Unit tests**: Cell mapping logic, change detection
  - Test `buildDocumentFromNotebook()` with various cell configurations
  - Test line-to-cell lookups
  - Test ZWS marker positioning

- **Integration tests**: Sync with Jupyter store
  - Test document updates when cells are executed
  - Test output widget rendering
  - Test marker protection filter behavior

- **E2E tests**: Create notebook → edit in single-file view → verify changes persist
  - Test read-only mode behavior
  - Test kernel execution and output rendering
  - Test navigation and scrolling

- **Performance tests**: Large notebook rendering and scrolling
  - Benchmark with 100+ cell notebooks
  - Measure decoration caching effectiveness
  - Test memory usage with large outputs

---

## Migration & Adoption

1. Start as an **experimental** second view option (alongside `jupyter_cell_notebook`)
2. Gather user feedback
3. Stabilize the implementation
4. Consider making it the default view (with classic view still available)

---

## Known Issues

### Mentions Not Working in Markdown Cell Edit Mode

When editing markdown cells (double-click to enter edit mode), the mention popup (`@` character to mention users) does not appear, even though `enableMentions` is set to `true` and `project_id`/`path` are correctly passed to `MarkdownInput`.

**Root Cause**: CodeMirror widgets have layout constraints that may clip or hide absolutely-positioned popups. The mention menu uses `offset` positioning which is relative to the widget container and gets clipped.

**Status**: Open - potential solutions to investigate:

- Use Portal-based positioning instead of offset
- Adjust z-index and overflow properties
- Consider alternative mention UI (e.g., modal dialog)

**Workaround**: Mentions work in the regular Jupyter notebook markdown cells; use that editor for markdown content that requires mentions.

**Files involved**:

- `packages/frontend/frame-editors/jupyter-editor/single/markdown-widgets.tsx` - MarkdownEditWidget
- `packages/frontend/editors/markdown-input/component.tsx` - MarkdownInput (the mention rendering logic)

---

## Future Enhancements

1. **Fix mentions in markdown cells**: Implement proper positioning/display of mention popup in edit mode
2. **Split view**: Show notebook in cell-based view AND single-file view side-by-side
3. **Outline panel**: Quick navigation to cells/sections
4. **Code folding**: Collapse cell inputs/outputs
5. **Kernel state panel**: Show kernel variables alongside editor
6. **Collaborative editing**: Multi-user support with cursors and selections
7. **Smart output updates**: Detect incremental output changes and update only affected cells
8. **Editable outputs**: Allow users to clear outputs, delete outputs selectively
9. **Output history**: Show previous outputs when re-executing cells

---

## Glossary

- **Cell**: A discrete unit of the notebook (code, markdown, or raw)
- **Input**: The source code/markdown of a cell
- **Output**: The result of executing a cell (text, HTML, plots, errors)
- **Marker**: A CodeMirror widget representing output (using invisible ZWS character)
- **Mapping**: The correspondence between a cell and a line range in the document
- **Sync**: Bidirectional updates between notebook state and editor state
- **Zero-Width Space (U+200B)**: Invisible Unicode character used as output marker
- **StateEffect**: CodeMirror mechanism for signaling state changes to extensions
- **Decoration**: Visual or logical overlay on CodeMirror document content
- **ChangeFilter**: CodeMirror mechanism to intercept and suppress transactions

---

## Implementation Status & Location

**Source Code:** `packages/frontend/frame-editors/jupyter-editor/single/`

### Files

- `single.tsx` - Frame tree wrapper component
- `editor.tsx` - CodeMirror 6 editor with extensions
- `state.ts` - Document building and cell mapping utilities
- `output.tsx` - Output widget rendering
- `decorations.ts` - Decoration state field and caching
- `filters.ts` - Marker line protection
- `cell-gutter.ts` - Custom gutter with In[N]/Out[N] labels

### Current Phase

**Phase 2 (Output Widgets & Optimization)** ✅ **Complete**

**Phase 3 (Interactive Outputs)** - Planning

### Build Status

✅ **Success** (no TypeScript errors)
