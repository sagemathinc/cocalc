# Jupyter Single-File Editor Architecture Analysis

## 1. Zero-Width Space (ZWS) Marker System

### What is a ZWS Marker?

**Definition:**
- Unicode character `U+200B` (invisible, zero-width space)
- String constant defined in `/packages/frontend/frame-editors/jupyter-editor/single/utils.ts`:
  ```typescript
  export const ZERO_WIDTH_SPACE = "\u200b";
  ```

**Current Format:**
- Each marker line consists of: `ZWS + optional letter (c/m/r)` 
  - `c` = code cell (has outputs)
  - `m` = markdown cell (displays markdown)
  - `r` = raw cell
- Examples: `\u200bc`, `\u200bm`, `\u200br`

### Marker Positioning in Document

**Document Structure:**
```
Line 0: print('hello')           <- Code cell input (line 0)
Line 1: ⁠c                        <- ZWS marker + 'c' (line 1 = outputMarkerLine)
Line 2: x = 5                     <- Next code cell input (line 2)
Line 3: ⁠c                        <- ZWS marker for second cell (line 3)
```

**Key Properties:**
- Each cell has exactly ONE marker line
- Marker line immediately follows the cell's source lines
- Marker is INVISIBLE to user (doesn't display)
- Replaced with CodeMirror decorations (output widgets, markdown widgets)
- Protected from user deletion by `createMarkerProtectionFilter()`

**Detection Logic** (`editor.tsx` lines 129-137, 610-616):
```typescript
for (let i = 0; i < doc.lines; i++) {
  const line = doc.line(i + 1); // 1-indexed
  // Check if line starts with ZWS and has length 1-2 (ZWS + optional letter)
  if (line.text.startsWith(ZERO_WIDTH_SPACE) && line.text.length <= 2) {
    currentMarkerLines.push(i); // 0-indexed
  }
}
```

---

## 2. Cell Mapping Data Structure

### CellMapping Interface (`state.ts` lines 27-48)

```typescript
export interface CellMapping {
  cellId: string;                    // Unique identifier
  cellType: "code" | "markdown" | "raw";
  inputRange: {
    from: number;  // Line number (0-indexed) where cell source starts
    to: number;    // Line number (0-indexed, exclusive) where source ends
  };
  outputMarkerLine: number;          // 0-indexed line with ZWS marker
  source: string[];                  // Array of source code lines
  execCount?: number;                // Execution count (In[N] label)
  metadata?: Record<string, any>;    // Cell metadata
  outputs?: any[];                   // Cell outputs for rendering
  state?: CellState;                 // "busy" | "run" | "start" | undefined
  position: "below";                 // Where insert-cell widget appears
}
```

### DocumentData Structure

```typescript
export interface DocumentData {
  content: string;              // Full CodeMirror document text
  mappings: CellMapping[];      // Array of cell mappings (order matters!)
}
```

### Mapping Invariants

1. **Order matters**: `mappings[]` array index corresponds to cell order
2. **Cell boundaries**:
   - `inputRange.to` is EXCLUSIVE (doesn't include marker)
   - `inputRange.from` (0-indexed) = line after previous marker OR 0
   - `outputMarkerLine` = `inputRange.to`
3. **All cells tracked**: Even markdown/raw cells with empty input ranges
4. **No gaps**: Cell input ranges are contiguous with marker lines between them

**Example Mapping:**
```
Cell 0 (code):     inputRange: {from: 0, to: 2},   outputMarkerLine: 2
Cell 1 (markdown): inputRange: {from: 3, to: 3},   outputMarkerLine: 3
Cell 2 (code):     inputRange: {from: 4, to: 5},   outputMarkerLine: 5
```

---

## 3. Building Document from Notebook (`buildDocumentFromNotebook`)

### Location
`/packages/frontend/frame-editors/jupyter-editor/single/state.ts` lines 71-168

### Algorithm

```
FOR EACH cell_id in cell_list:
  1. Read cell type, input, outputs from notebook
  2. Split input string into source lines
  3. IF cellType !== "markdown":
       - Add source lines to document
       - Set inputRange: {from: currentLine, to: currentLine + sourceLines.length}
       - Set outputMarkerLine: currentLine + sourceLines.length
     ELSE (markdown):
       - Do NOT add source lines to document
       - Set inputRange: {from: currentLine, to: currentLine} (empty range)
       - Set outputMarkerLine: currentLine
  4. Always append marker line: ZERO_WIDTH_SPACE + cellType character
  5. Create CellMapping with all metadata
  6. Increment currentLine

RETURN { content: lines.join("\n"), mappings }
```

### Key Behavior

**Code/Raw Cells:**
- Source lines added to document
- Visible in editor
- User can edit

**Markdown Cells:**
- NO source lines in document
- Only marker line exists
- Rendered as separate widget above marker
- Input stored in cell.source array, not in editor document

---

## 4. Store Structure

### Cell Storage

**Store Path:** `store.get("cells")` returns `Immutable.Map<cellId, cellData>`

**Cell Object Structure:**
```typescript
{
  id: string;
  cell_type: "code" | "markdown" | "raw";
  input: string;              // Source code as single string
  output?: Immutable.Map;     // Outputs map: numeric string keys ("0", "1", etc.)
  exec_count?: number;
  state?: CellState;
  // ... other metadata
}
```

**Cell List:** `store.get("cell_list")` returns `Immutable.List<cellId>`
- Ordered list of cell IDs
- Defines cell order in notebook
- Used to iterate cells in buildDocumentFromNotebook

### Store Update Path

```
User edits cell in editor
  ↓
handleDocumentChange() extracts cell content
  ↓
actions.set_cell_input(cellId, content, save=true)
  ↓
Sets cell.input in store
  ↓
Store listener detects change
  ↓
Rebuilds document if structure changed
```

---

## 5. Synchronization Between Document and Store

### Two-Way Synchronization

**Forward Path (Document → Store):**
1. User edits CodeMirror document
2. `EditorView.updateListener` fires (`editor.tsx` lines 360-455)
3. Debounced `handleDocumentChange()` runs (500ms timeout from `SAVE_DEBOUNCE_MS`)
4. Scans markers to rebuild mappings (accounts for user edits)
5. Compares extracted cell content with previous version
6. Calls `actions.set_cell_input(cellId, newContent, true)` only for changed cells
7. Updates `lastCellsRef.current` to prevent feedback loops

**Reverse Path (Store → Document):**
1. Store listener fires on cell change (`editor.tsx` lines 485-815)
2. Checks if cells/cell_list structure changed
3. IF structure changed: Rebuild entire document via `buildDocumentFromNotebook()`
4. IF content changed: Apply granular line-by-line diffs
5. Scans markers again to rebuild mappings
6. Updates outputs/state from store
7. Dispatches changes to CodeMirror

### Change Detection

**Structure Changes Detected:**
- Cell list length differs
- Cell IDs in different order
- New cells added
- Cells deleted

**Content Changes Detected:**
- Cell input differs from stored value
- Cell outputs differ
- Cell state changed (for execution indicators)

**Change Filter Optimization** (`editor.tsx` lines 513-565):
```typescript
// Early exit: skip processing if no relevant changes
if (!hasContentOrStructureChange && !hasStateChange) {
  return; // No relevant changes
}
```

---

## 6. Cell Creation/Insertion Mechanisms

### Methods Available

**`insert_cell_adjacent(cellId, delta, save?)`** (`actions.ts:899`)
- Parameters:
  - `cellId`: Reference cell
  - `delta`: `-1` (above) or `1` (below)
  - `save`: Auto-commit to syncdb (default true)
- Returns: New cell ID (UUID)
- Uses: `cell_utils.new_cell_pos()` to calculate position
- Calls: `insert_cell_at(position, save)`

**`insert_cell_at(position, save?, id?)`** (`actions.ts:876`)
- Parameters:
  - `position`: Numeric position in cell_list
  - `save`: Auto-commit (default true)
  - `id`: Custom cell ID (optional, used by whiteboard)
- Returns: New cell ID
- Calls: `_set({type: "cell", id, pos, input: ""}, save)`
- Initial state: Empty input, no cell_type specified (defaults to "code")

**`set_cell_input(cellId, input, save?)`** (`actions.ts:280`)
- Sets cell.input in store
- Skips update if input unchanged (optimization)
- Checks edit protection (read-only, locked cells)

**`delete_cells(cellIds[], sync?)`** (`actions.ts:917`)
- Parameters:
  - `cellIds`: Array of cell IDs to delete
  - `sync`: Auto-commit (default true)
- Checks: `store.is_cell_deletable()` for each cell
- Calls: `_delete({type: "cell", id}, false)` for each
- Then: `_sync()` if sync=true

### Cell Insertion in Single-File Mode

**UI Integration** (`editor.tsx` lines 294-312):
```typescript
const handleInsertCell = (
  cellId: string,
  type: "code" | "markdown",
  position: "above" | "below",
) => {
  const delta = position === "above" ? (-1 as const) : (1 as const);
  const newCellId = props.actions.insert_cell_adjacent(cellId, delta);
  
  if (type === "markdown") {
    props.actions.set_cell_type(newCellId, "markdown");
  }
};
```

**Widget Rendering** (`output.tsx` lines 108-133):
- InsertCell widget rendered BELOW each cell's output marker
- Part of OutputWidget decoration
- User clicks "+" button → calls `onInsertCell` callback
- Callback inserts new cell via `insert_cell_adjacent()`

---

## 7. Cell Deletion and Merging

### Boundary Deletion Detection (`createCellMergingFilter`)

**Trigger Conditions:**
- User presses Delete key at end of cell (last line)
- User presses Backspace at start of cell (first line)
- Single character deletion detected

**Behavior:**
```typescript
if (isAtEnd && cellIndex < mappingsRef.current.length - 1) {
  // Delete at end: merge WITH NEXT cell
  targetCell = mappingsRef.current[cellIndex + 1];
} else if (isAtStart && cellIndex > 0) {
  // Backspace at start: merge WITH PREVIOUS cell
  targetCell = mappingsRef.current[cellIndex - 1];
}

// Merge: concatenate target + newline + source
const mergedContent = targetContent + "\n" + sourceContent;
props.actions.set_cell_input(targetCellId, mergedContent, true);
props.actions.delete_cells([sourceCellId]);
```

### Range Deletion Detection (`createRangeDeletionFilter`)

**Trigger Conditions:**
- User selects and deletes multiple characters or multiple lines
- Deletion spans one or more cells

**Algorithm:**
1. Find all cells overlapping with deleted range
2. For each cell:
   - If entirely deleted: mark for deletion
   - If partially deleted: mark for modification with remaining content
3. Dispatch effects:
   - `rangeDeletionEffect` with type:"delete" or type:"modify"
4. Update listener applies effects:
   - Calls `delete_cells([cellId])` for complete deletions
   - Calls `set_cell_input(cellId, newContent)` for partial deletions

---

## 8. Marker Protection (`createMarkerProtectionFilter`)

### Purpose
Prevent users from accidentally deleting ZWS marker lines

### Implementation

```typescript
export function createMarkerProtectionFilter(): Extension {
  return EditorState.changeFilter.of((tr: Transaction) => {
    // 1. Scan NEW document for actual ZWS marker lines
    const protectedRanges: [number, number][] = [];
    
    for (let lineNum = 1; lineNum <= newDoc.lines; lineNum++) {
      const line = newDoc.line(lineNum);
      if (line.text.startsWith(ZERO_WIDTH_SPACE) && line.text.length <= 2) {
        protectedRanges.push([line.from, line.to]);
      }
    }
    
    // 2. Check if any change overlaps protected ranges
    tr.changes.iterChanges((_fromA, _toA, fromB, toB) => {
      if (fromB < end && toB > start) {
        hasConflict = true;
      }
    });
    
    // 3. If conflicts, return protected ranges to suppress deletion
    if (hasConflict) {
      return flattenedRanges; // Suppresses the deletion
    }
    
    return true; // Allow change
  });
}
```

**Key Point:** Scans the NEW document state, not cached mappings, to account for recent edits

---

## 9. Cell Execution (`createCellExecutionKeyHandler`)

### Trigger
User presses `Shift+Return` (Shift+Enter)

### Behavior
```typescript
event.shiftKey && (event.key === "Enter" || event.code === "Enter")
  ↓
Flush pending edits: flushPendingChangesRef.current()
  ↓
Get affected cells from cursor/selection
  ↓
For each cell: actions.run_cell(cellId)
```

**Affected Cells Selection:**
- Single cursor: Run only the cell containing cursor
- Selection span: Run all cells overlapping with selection

---

## 10. Paste Handling (Current State)

### Current Limitations

**NOT YET IMPLEMENTED** (See `editor.tsx` lines 247-261):
```typescript
// CHECK FOR NEW CELLS FROM PASTED CONTENT
// If user pasted cells with ZWS markers, create new cells for them
// TODO: This needs to be implemented carefully to avoid infinite loops
// when the store listener rebuilds the document. For now, we'll defer this.
```

### Challenge
- When user pastes content with ZWS markers
- System needs to detect: "This is pasted cell content, not user edits"
- Requires creating new cells in notebook store
- Risk: Infinite loop if store rebuild triggers paste detection again

---

## 11. Data Flow Diagram

```
EDITING FLOW:
User types in editor
  ↓
CodeMirror transaction fires
  ↓
updateListener (lines 360-455)
  ├─ Check for cell merge effects
  ├─ Check for range deletion effects
  └─ Debounce handleDocumentChange() [500ms]
  ↓
handleDocumentChange() (lines 117-264)
  ├─ Scan for marker lines
  ├─ Rebuild mappings from markers
  ├─ Extract cell content
  ├─ Compare with lastCells
  └─ Call actions.set_cell_input() for changes
  ↓
Store updates via syncdb
  ↓
Store listener (lines 486-815)
  ├─ Detect structure/content changes
  ├─ Check if cell_list changed
  ├─ If changed: rebuild document
  ├─ If not: apply incremental diffs
  └─ Dispatch to CodeMirror

STORE UPDATES FLOW:
Backend/other users change notebook
  ↓
Store updates via syncdb
  ↓
Store listener (lines 486-815)
  ├─ Fetch updated cells
  ├─ Check for changes
  ├─ Build new document or apply diffs
  ├─ Update lastCellsRef
  └─ Dispatch to CodeMirror

CELL INSERTION FLOW:
User clicks insert cell button
  ↓
InsertCell component (output.tsx, lines 108-133)
  ↓
Calls onInsertCell callback (lines 118-129)
  ├─ Position: "below"
  ├─ Type: "code" or "markdown"
  └─ CellId: target cell
  ↓
handleInsertCell (editor.tsx, lines 294-312)
  ├─ Calculate delta (-1 or +1)
  ├─ Call actions.insert_cell_adjacent(cellId, delta)
  └─ If markdown: call actions.set_cell_type(newId, "markdown")
  ↓
Actions layer:
  ├─ new_id = uuid()
  ├─ pos = new_cell_pos() [calculates position in list]
  ├─ insert_cell_at(pos) [creates empty cell in store]
  └─ Commits to syncdb
  ↓
Store listener rebuilds document
```

---

## Summary: Key Takeaways for Paste Detection

### Document Structure Foundation
1. **ZWS markers** (`\u200b`) with cell type letter (c/m/r) mark cell boundaries
2. **Markers are invisible** but scanned to rebuild mappings after each edit
3. **Cell mapping** maintains relationship: input lines + marker line for each cell

### Store Synchronization
- **Two-way binding**: Document ↔ Store via set_cell_input and store listener
- **Feedback prevention**: lastCellsRef tracks what we sent to avoid echoing back
- **Marker-based mapping**: Always rebuilt from actual document state (not cached)

### Cell Management  
- **Creation**: insert_cell_adjacent() or insert_cell_at() creates empty cell, store listener rebuilds doc
- **Deletion**: delete_cells() or boundary merging via effects
- **Editing**: set_cell_input() updates cell content in store

### Paste Detection Requirements
1. Detect when pasted content has ZWS markers
2. Count markers in new document vs old document
3. If more markers: new cells were pasted
4. For each new marker: create corresponding cell in store
5. Prevent infinite loop: mark created cells so listener knows they're from us


---

## 12. Pseudocode: Insert Range Detection Algorithm

### Algorithm: Detect Newly Pasted Cells with ZWS Markers

```pseudocode
FUNCTION detectPastedCells(
  oldDoc: CodeMirrorDocument,
  newDoc: CodeMirrorDocument,
  oldMappings: CellMapping[]
): InsertedCell[] {
  
  // Step 1: Scan old document for existing ZWS markers
  oldMarkerLines = []
  FOR lineNum = 1 TO oldDoc.lines:
    line = oldDoc.line(lineNum)
    IF line.text.startsWith(ZWS) AND line.text.length <= 2:
      oldMarkerLines.push(lineNum - 1)  // 0-indexed
  
  // Step 2: Scan new document for all ZWS markers
  newMarkerLines = []
  FOR lineNum = 1 TO newDoc.lines:
    line = newDoc.line(lineNum)
    IF line.text.startsWith(ZWS) AND line.text.length <= 2:
      newMarkerLines.push({
        line: lineNum - 1,        // 0-indexed
        char: line.text[1] OR 'c' // Extract type char (c/m/r)
      })
  
  // Step 3: Detect which markers are new
  // (This is non-trivial because existing markers may have shifted due to pastes)
  newCells = []
  existingMarkerIndex = 0
  
  FOR i = 0 TO newMarkerLines.length - 1:
    newMarker = newMarkerLines[i]
    
    // Check if this marker corresponds to an existing cell
    IF existingMarkerIndex < oldMarkerLines.length:
      oldMarkerLine = oldMarkerLines[existingMarkerIndex]
      
      // Calculate expected position of this marker in new doc
      // (approximate based on content before this point)
      expectedNewLine = calculateExpectedLine(
        oldMarkerLine,
        oldDoc,
        newDoc,
        existingMarkerIndex
      )
      
      IF newMarker.line == expectedNewLine:
        // This marker is in roughly the same position as existing cell
        existingMarkerIndex += 1
        CONTINUE  // Not a newly pasted marker
      ENDIF
    ENDIF
    
    // This is a new marker - user pasted cells
    newCells.push({
      insertAtLine: newMarker.line,
      cellType: newMarker.char == 'm' ? "markdown" : 
                newMarker.char == 'r' ? "raw" : "code"
    })
  ENDFOR
  
  RETURN newCells
}

// Step 4: Extract content range for newly pasted cell
FUNCTION extractPastedCellContent(
  doc: CodeMirrorDocument,
  insertAtMarkerLine: number,
  cellType: string
): {
  contentLines: string[],
  insertRange: {from: number, to: number}
} {
  
  // Find previous marker line (or start of document)
  prevMarkerLine = 0
  FOR i = insertAtMarkerLine - 1 DOWNTO 0:
    line = doc.line(i + 1)
    IF line.text.startsWith(ZWS) AND line.text.length <= 2:
      prevMarkerLine = i + 1
      BREAK
    ENDIF
  ENDFOR
  
  // Cell content spans from (prevMarkerLine + 1) to insertAtMarkerLine
  contentStart = prevMarkerLine
  contentEnd = insertAtMarkerLine
  
  contentLines = []
  FOR i = contentStart TO contentEnd - 1:
    contentLines.push(doc.line(i + 1).text)
  ENDFOR
  
  RETURN {
    contentLines: contentLines,
    insertRange: {from: contentStart, to: contentEnd}
  }
}

// Step 5: Create new cells in store
FUNCTION createPastedCells(
  newCells: InsertedCell[],
  doc: CodeMirrorDocument,
  actions: JupyterActions,
  cellList: List<string>,
  cells: Map<string, any>
): void {
  
  FOR insertedCell IN newCells:
    // Extract content
    {contentLines, insertRange} = extractPastedCellContent(
      doc,
      insertedCell.insertAtMarkerLine,
      insertedCell.cellType
    )
    
    cellContent = contentLines.join("\n")
    
    // Determine position in cell_list
    // Count how many cells have markers before this insertion
    cellsBeforeCount = 0
    FOR i = 0 TO insertedCell.insertAtMarkerLine:
      IF doc.line(i + 1).text.startsWith(ZWS):
        cellsBeforeCount += 1
      ENDIF
    ENDFOR
    insertPosition = cellsBeforeCount - 1
    
    // Create new cell in store
    newCellId = actions.insert_cell_at(insertPosition)
    actions.set_cell_input(newCellId, cellContent, false)
    
    IF insertedCell.cellType == "markdown":
      actions.set_cell_type(newCellId, "markdown")
    ENDIF
  ENDFOR
  
  // Commit all changes at once
  actions._sync()
}
```

### Key Challenges Addressed

1. **Marker Alignment**: Old markers may shift due to pasted content before them
   - Solution: Calculate expected position based on line count changes
   
2. **Multiple Pastes**: User might paste multiple cells at once
   - Solution: Iterate through all new markers and identify contiguous gaps
   
3. **Markdown Cell Content**: Markdown cells don't have source lines in document
   - Solution: Skip them during content extraction (they're just markers)
   
4. **Infinite Loops**: Store rebuild triggers paste detection again
   - Solution: Track pending cell creations to avoid re-processing
   
5. **Cell Position Calculation**: Where to insert new cells in cell_list
   - Solution: Count markers before insertion point to determine position

---

## 13. Implementation Approach for Paste Detection

### Phase 1: Basic Detection (Current TODO)

**Trigger Point:** In `handleDocumentChange()` at lines 247-261

**Logic:**
```typescript
// After rebuilding mappings from markers
const currentMarkerCount = currentMarkerLines.length;
const previousMarkerCount = mappingsRef.current.length;

if (currentMarkerCount > previousMarkerCount) {
  const newMarkerIndices = findNewMarkers(
    currentMarkerLines,
    mappingsRef.current
  );
  
  for (const markerIdx of newMarkerIndices) {
    const {content, position} = extractPastedCell(
      view.state.doc,
      currentMarkerLines[markerIdx],
      markerIdx
    );
    
    const newCellId = props.actions.insert_cell_at(position);
    props.actions.set_cell_input(newCellId, content, false);
  }
  
  props.actions._sync();
  return; // Don't process as normal edits
}
```

### Phase 2: Refinements

1. **Detect cell type from marker character**: Extract 'm' or 'r' from marker
2. **Handle mixed pastes**: Users paste code + markdown
3. **Validate content**: Ensure extracted content is valid (not partial)
4. **Debouncing**: Only check for pastes during specific transaction types

### Phase 3: Edge Cases

1. **User pastes and immediately edits**: Need to merge paste detection with normal edits
2. **Paste at document boundaries**: First/last position handling
3. **Paste within a cell**: Don't split cells, treat as normal edit
4. **Paste with syntax errors**: Create cells anyway (will be invalid, but user can fix)

---

## 14. Files Involved and Their Responsibilities

| File | Purpose | Key Functions |
|------|---------|---------------|
| **state.ts** | Document structure, cell mappings, types | `buildDocumentFromNotebook()`, `CellMapping`, `DocumentData` |
| **utils.ts** | Cell location queries, ZWS constant | `findCellAtLine()`, `getCellsInRange()`, `ZERO_WIDTH_SPACE` |
| **editor.tsx** | Main editor component, sync logic | `handleDocumentChange()`, store listener, initialization |
| **filters.ts** | CodeMirror transaction filters | Marker protection, cell merging, range deletion, execution |
| **output.tsx** | Output and insert cell widgets | `OutputWidget`, rendering outputs + insert button |
| **decorations.ts** | Output decoration state field | `createOutputDecorationsField()`, widget creation |
| **actions.ts** | Redux actions for cell operations | `insert_cell_at()`, `set_cell_input()`, `delete_cells()` |

### Call Chain for Cell Operations

```
User Action → Widget/Handler → actions.* method → syncdb.set/delete → Store updates
                                                       ↓
                                           Store listener in editor.tsx
                                                       ↓
                                          Rebuild mappings from markers
                                                       ↓
                                          Dispatch changes to CodeMirror
```

---

## 15. Testing Paste Detection

### Test Cases to Implement

```typescript
describe("Paste Detection", () => {
  test("Detect single pasted cell", () => {
    // Paste content with one new ZWS marker
    // Verify: new cell created in store
  });
  
  test("Detect multiple pasted cells", () => {
    // Paste content with 3 new ZWS markers
    // Verify: 3 new cells created in order
  });
  
  test("Detect mixed code and markdown cells", () => {
    // Paste "code" + "markdown" + "code"
    // Verify: cell types set correctly
  });
  
  test("No detection for user-edited ZWS", () => {
    // User manually types ZWS (unlikely but possible)
    // Verify: no new cell created (need marker at start of line)
  });
  
  test("Prevent infinite loop on store rebuild", () => {
    // Paste cell → store updates → editor rebuilds
    // Verify: paste detection doesn't trigger again
  });
  
  test("Paste with existing cell edits", () => {
    // Edit cell + paste new cells simultaneously
    // Verify: both changes applied correctly
  });
});
```

---

## Conclusion

The Jupyter single-file editor uses an elegant system of **zero-width space markers** to track cell boundaries while maintaining a single CodeMirror document. This design enables:

1. **Bidirectional sync** between editor and notebook store
2. **Cell-aware operations** (merge, delete, execute) without complex diff algorithms
3. **Markdown cells** rendered as widgets while code cells are editable
4. **Invisible markers** that define structure without visual clutter

The main gap is **paste detection**, which needs to:
- Identify when ZWS markers appear in the document (indicating pasted cells)
- Extract their content and create corresponding cells in the store
- Prevent infinite loops by tracking which creations are from pastes

The algorithm relies on **marker line scanning** (cheap operation) and **marker position mapping** to distinguish existing cells from newly pasted ones.
