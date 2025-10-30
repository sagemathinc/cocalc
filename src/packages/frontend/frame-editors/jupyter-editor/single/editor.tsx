/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Main editor component for single-file view.
Renders a CodeMirror 6 editor with cell content and output widgets.
Phase 2: Editable with debounced sync to notebook store.
*/

import type { List, Map } from "immutable";

import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";
import { python } from "@codemirror/lang-python";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState, RangeSet, StateField } from "@codemirror/state";
import { Decoration, EditorView, highlightActiveLine } from "@codemirror/view";

import {
  CSS,
  React,
  useEffect,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { JupyterEditorActions } from "../actions";
import { createCellGutterWithLabels } from "./cell-gutter";
import { createInsertCellDecorationsField } from "./cell-insertion";
import {
  createOutputDecorationsField,
  outputsChangedEffect,
} from "./decorations";
import {
  createCellExecutionKeyHandler,
  createMarkerProtectionFilter,
} from "./filters";
import { buildDocumentFromNotebook, type CellMapping } from "./state";
import { getCellsInRange, ZERO_WIDTH_SPACE } from "./utils";

interface Props {
  actions: JupyterActions;
  editor_actions: JupyterEditorActions;
  name: string;
  is_focused?: boolean;
  is_visible?: boolean;
  is_fullscreen?: boolean;
  font_size: number;
  project_id: string;
  path: string;
}

const EDITOR_STYLE: CSS = {
  width: "100%",
  height: "100%",
  overflow: "auto",
} as const;

export const SingleFileEditor: React.FC<Props> = React.memo((props: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const mappingsRef = useRef<CellMapping[]>([]);
  const outputDecoFieldRef = useRef<
    StateField<RangeSet<Decoration>> | null | undefined
  >(undefined);
  const insertCellDecoFieldRef = useRef<
    StateField<RangeSet<Decoration>> | null | undefined
  >(undefined);
  const lastCellsRef = useRef<Map<string, any> | null>(null);
  const [hasEditor, setHasEditor] = useState(false);
  // Trigger to re-check data when store changes
  const [storeUpdateTrigger, setStoreUpdateTrigger] = useState(0);
  // Track which markdown cells are in edit mode
  const [_mdEditIds, setMdEditIds] = useState<Set<string>>(new Set());
  const mdEditIdsRef = useRef<Set<string>>(new Set());
  // Debounced change handler
  const debouncedChangeRef = useRef<NodeJS.Timeout | null>(null);
  // Store the last pending update so we can flush it on demand
  const pendingUpdateRef = useRef<any>(null);
  // Function to flush pending changes (exposed for keyboard handler)
  const flushPendingChangesRef = useRef<() => void>(() => {});

  // Toggle markdown cell edit mode
  const toggleMarkdownEdit = React.useCallback(
    (cellId: string, isEdit: boolean) => {
      setMdEditIds((prev) => {
        const next = new Set(prev);
        if (isEdit) {
          next.add(cellId);
        } else {
          next.delete(cellId);
        }
        mdEditIdsRef.current = next;
        return next;
      });

      // Dispatch effect to update decorations
      if (viewRef.current) {
        viewRef.current.dispatch({
          effects: outputsChangedEffect.of(new Set([cellId])),
        });
      }
    },
    [],
  );

  // Handle document changes by mapping them back to cell updates
  const handleDocumentChange = React.useCallback(
    (update: any) => {
      if (!viewRef.current || !mappingsRef.current || !lastCellsRef.current)
        return;

      const view = viewRef.current;
      const doc = view.state.doc;
      const lastCells = lastCellsRef.current;

      // CRITICAL: Rebuild mappings from current document BEFORE extracting cell content
      // This ensures we use correct cell boundaries, not stale mappings
      const currentMarkerLines: number[] = [];
      for (let i = 0; i < doc.lines; i++) {
        const line = doc.line(i + 1); // 1-indexed
        if (line.text === ZERO_WIDTH_SPACE) {
          currentMarkerLines.push(i); // 0-indexed
        }
      }

      // Rebuild mappings based on actual marker positions
      const currentMappings: CellMapping[] = [];
      for (
        let i = 0;
        i < currentMarkerLines.length && i < mappingsRef.current.length;
        i++
      ) {
        const markerLine = currentMarkerLines[i];
        const originalMapping = mappingsRef.current[i];

        // Cell input starts after the previous marker (or at line 0)
        const inputStart = i === 0 ? 0 : currentMarkerLines[i - 1] + 1;
        // Cell input ends BEFORE this marker (exclusive)
        const inputEnd = markerLine;

        currentMappings.push({
          ...originalMapping,
          inputRange: { from: inputStart, to: inputEnd },
          outputMarkerLine: markerLine,
        });
      }

      // Find changed line ranges from the update
      // Map ChangeSet to line ranges: iterate through all changes and collect affected lines
      const changedLines = new Set<number>();
      let affectedLineStart = doc.lines; // Large number
      let affectedLineEnd = 0;

      update.changes.iterChanges(
        (_fromA: number, _toA: number, fromB: number, toB: number) => {
          // Convert character positions to line numbers
          const fromLine = doc.lineAt(fromB).number - 1; // 0-indexed
          const toLine = doc.lineAt(toB).number - 1; // 0-indexed
          affectedLineStart = Math.min(affectedLineStart, fromLine);
          affectedLineEnd = Math.max(affectedLineEnd, toLine);
          // Mark individual lines as changed
          for (let line = fromLine; line <= toLine; line++) {
            changedLines.add(line);
          }
        },
      );

      // If no changes detected, return early
      if (changedLines.size === 0) {
        return;
      }

      // Find which cells contain the changed lines
      const affectedCells = getCellsInRange(
        currentMappings,
        affectedLineStart,
        affectedLineEnd + 1,
      );

      // Extract and compare only the affected cells
      const cellsToUpdate: Array<{ cellId: string; content: string }> = [];

      for (const mapping of affectedCells) {
        const cellId = mapping.cellId;

        // Extract the cell's content from the document
        const cellLines: string[] = [];

        // inputRange.to is EXCLUSIVE
        for (
          let lineNum = mapping.inputRange.from;
          lineNum < mapping.inputRange.to;
          lineNum++
        ) {
          if (lineNum < doc.lines) {
            const line = doc.line(lineNum + 1); // Convert 0-indexed to 1-indexed for CodeMirror
            cellLines.push(line.text);
          }
        }

        // Join lines back into cell content
        const cellContent = cellLines.join("\n");

        // Get the original cell content to check if it actually changed
        const originalCell = lastCells.get(cellId);
        const originalContent = originalCell?.get("input") ?? "";

        // Only queue for update if content actually changed
        if (cellContent !== originalContent) {
          cellsToUpdate.push({ cellId, content: cellContent });
        }
      }

      // Update only the cells that changed
      let updatedLastCells = lastCells;
      for (const { cellId, content } of cellsToUpdate) {
        props.actions.set_cell_input(cellId, content, true);

        // Update lastCellsRef so the store listener knows this is our change
        // This prevents the feedback loop of duplicates
        if (updatedLastCells) {
          const cell = updatedLastCells.get(cellId);
          if (cell) {
            // Create updated cell with new input
            const updatedCell = cell.set("input", content);
            updatedLastCells = updatedLastCells.set(cellId, updatedCell);
          }
        }
      }
      if (updatedLastCells !== lastCells) {
        lastCellsRef.current = updatedLastCells;
      }

      // CHECK FOR NEW CELLS FROM PASTED CONTENT
      // If user pasted cells with ZWS markers, create new cells for them
      // TODO: This needs to be implemented carefully to avoid infinite loops
      // when the store listener rebuilds the document. For now, we'll defer this.
      // const currentMarkerLines: number[] = [];
      // for (let i = 0; i < doc.lines; i++) {
      //   const line = doc.line(i + 1); // 1-indexed
      //   if (line.text === "\u200b") {
      //     currentMarkerLines.push(i); // 0-indexed
      //   }
      // }
      //
      // if (currentMarkerLines.length > currentMappings.length) {
      //   // Would create new cells here
      // }
    },
    [props.actions],
  );

  // Initialize editor when we have data
  useEffect(() => {
    if (!containerRef.current) return;

    const store = props.actions.store;
    if (!store) return;

    // Get initial notebook data
    const cells = store.get("cells") as Map<string, any>;
    const cellList = store.get("cell_list") as List<string>;

    // Only create editor if we have data
    if (!cells || !cellList || cellList.isEmpty?.() || cells.isEmpty?.()) {
      return;
    }

    // Don't re-create if already exists
    if (viewRef.current) {
      return;
    }

    // Build initial document
    const { content, mappings } = buildDocumentFromNotebook(cells, cellList);
    mappingsRef.current = mappings;
    lastCellsRef.current = cells; // Track cells for change detection

    // Create the output decoration field with mappings reference (only once)
    if (!outputDecoFieldRef.current) {
      outputDecoFieldRef.current = createOutputDecorationsField(
        mappingsRef,
        {
          actions: props.actions,
          name: props.actions.name,
          project_id: props.project_id,
          directory: props.path,
        },
        mdEditIdsRef,
        toggleMarkdownEdit,
      );
    }

    // Create the insert-cell decoration field (only once)
    if (!insertCellDecoFieldRef.current) {
      // Callback for inserting cells in single-file mode
      const handleInsertCell = (
        cellId: string,
        type: "code" | "markdown",
        position: "above" | "below",
      ) => {
        // In single-file mode, use insert_cell_adjacent directly (non-deprecated API)
        // instead of the insertCell utility which requires NotebookFrameActions
        try {
          const delta = position === "above" ? (-1 as const) : (1 as const);
          const newCellId = props.actions.insert_cell_adjacent(cellId, delta);

          // Set cell type if needed
          if (type === "markdown") {
            props.actions.set_cell_type(newCellId, "markdown");
          }
        } catch (error) {
          console.error("[SingleFileEditor] Error inserting cell:", error);
        }
      };

      insertCellDecoFieldRef.current = createInsertCellDecorationsField(
        mappingsRef,
        {
          actions: props.actions,
          project_id: props.project_id,
          onInsertCell: handleInsertCell,
        },
      );
    }

    // Create the CodeMirror editor
    const state = EditorState.create({
      doc: content,
      extensions: [
        createCellGutterWithLabels(mappingsRef, props.actions), // Gutter with In[]/Out[] labels and line numbers
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle),
        python(),
        outputDecoFieldRef.current,
        insertCellDecoFieldRef.current,
        createMarkerProtectionFilter(), // Prevent deletion of output marker lines
        createCellExecutionKeyHandler(
          mappingsRef,
          props.actions,
          flushPendingChangesRef,
        ), // Shift+Return to execute cells
        // Change listener for editing
        EditorView.updateListener.of((update) => {
          if (
            update.docChanged &&
            !update.transactions.some((tr) => tr.isUserEvent("ignore"))
          ) {
            // Store the pending update so we can flush it on demand
            pendingUpdateRef.current = update;

            // Clear existing timeout
            if (debouncedChangeRef.current) {
              clearTimeout(debouncedChangeRef.current);
            }

            // Set new debounced timeout
            debouncedChangeRef.current = setTimeout(() => {
              if (pendingUpdateRef.current) {
                handleDocumentChange(pendingUpdateRef.current);
                pendingUpdateRef.current = null;
              }
            }, SAVE_DEBOUNCE_MS);
          }
        }),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    setHasEditor(true);

    // Set up the flush function for pending changes
    flushPendingChangesRef.current = () => {
      // Clear the debounce timeout
      if (debouncedChangeRef.current) {
        clearTimeout(debouncedChangeRef.current);
        debouncedChangeRef.current = null;
      }

      // Immediately process any pending update
      if (pendingUpdateRef.current) {
        handleDocumentChange(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
    };
  }, [storeUpdateTrigger, handleDocumentChange]); // Only re-run when explicitly triggered (initial data load)

  // Set up store listener for content updates (separate effect)
  useEffect(() => {
    const store = props.actions.store;
    if (!store) return;

    const handleChange = () => {
      // Only update if view is already mounted
      if (!viewRef.current) {
        // If editor hasn't been created yet, trigger the data-checking effect
        setStoreUpdateTrigger((prev) => prev + 1);
        return;
      }

      const updatedCells = store.get("cells") as Map<string, any>;
      const updatedCellList = store.get("cell_list") as List<string>;

      if (
        !updatedCells ||
        !updatedCellList ||
        updatedCellList.isEmpty?.() ||
        updatedCells.isEmpty?.()
      ) {
        return;
      }

      const lastCells = lastCellsRef.current;
      if (!lastCells) return; // Not initialized yet

      // Early exit: only process if cells or cell_list actually changed
      // This avoids processing cursor/focus/selection/metadata changes
      let hasContentOrStructureChange = false;
      let hasStateChange = false;

      // Check if cell list structure changed
      if (
        mappingsRef.current.length !== updatedCellList.size ||
        mappingsRef.current.some(
          (m, idx) => m.cellId !== updatedCellList.get(idx),
        )
      ) {
        hasContentOrStructureChange = true;
      } else {
        // Check if any cell's input, outputs, or state changed
        for (const mapping of mappingsRef.current) {
          const oldCell = lastCells.get(mapping.cellId);
          const newCell = updatedCells.get(mapping.cellId);

          const oldInput = oldCell?.get("input") ?? "";
          const newInput = newCell?.get("input") ?? "";
          if (oldInput !== newInput) {
            hasContentOrStructureChange = true;
            break;
          }

          const oldOutput = oldCell?.get("output");
          const newOutput = newCell?.get("output");
          // Use .equals() for Immutable.js comparison instead of reference equality
          if (oldOutput && newOutput) {
            if (!oldOutput.equals?.(newOutput)) {
              hasContentOrStructureChange = true;
              break;
            }
          } else if (oldOutput !== newOutput) {
            // Handle null/undefined cases
            hasContentOrStructureChange = true;
            break;
          }

          // Check if cell state changed (for execution status indicators)
          const oldState = oldCell?.get("state");
          const newState = newCell?.get("state");
          if (oldState !== newState) {
            hasStateChange = true;
            // Don't break here - continue checking other cells for structure changes
          }
        }
      }

      if (!hasContentOrStructureChange && !hasStateChange) {
        return; // No relevant changes, skip processing
      }

      // CHECK: Has the cell list itself changed? (new cells, deleted cells, reordered)
      const cellListChanged =
        mappingsRef.current.length !== updatedCellList.size ||
        mappingsRef.current.some(
          (m, idx) => m.cellId !== updatedCellList.get(idx),
        );

      if (cellListChanged) {
        // Rebuild the entire document because cells were added, removed, or reordered
        const { content, mappings } = buildDocumentFromNotebook(
          updatedCells,
          updatedCellList,
        );
        mappingsRef.current = mappings;
        lastCellsRef.current = updatedCells;

        // Replace the entire editor document by dispatching changes
        // This preserves all extensions and view state
        const oldDoc = viewRef.current.state.doc;

        // Also signal that ALL cell outputs need to be re-rendered
        // (decoration field may have cached old widgets)
        const allCellIds = new Set(mappings.map((m) => m.cellId));

        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: oldDoc.length,
            insert: content,
          },
          effects: outputsChangedEffect.of(allCellIds),
        });

        return; // Don't do incremental updates after rebuild
      }

      // IMPORTANT: Rebuild mappings from current document state before syncing changes.
      // This prevents race conditions: the document may have been modified by user edits,
      // so we need to determine current cell boundaries from marker positions.

      const currentDoc = viewRef.current.state.doc;

      // Scan document for marker lines to rebuild current mappings
      const currentMarkerLines: number[] = [];
      for (let i = 0; i < currentDoc.lines; i++) {
        const line = currentDoc.line(i + 1); // 1-indexed
        if (line.text === ZERO_WIDTH_SPACE) {
          currentMarkerLines.push(i); // 0-indexed
        }
      }

      // Rebuild mappings based on marker positions in document
      const rebuildMappings: CellMapping[] = [];
      for (
        let i = 0;
        i < currentMarkerLines.length && i < mappingsRef.current.length;
        i++
      ) {
        const markerLine = currentMarkerLines[i];
        const originalMapping = mappingsRef.current[i];
        const newCell = updatedCells.get(originalMapping.cellId);

        // Cell input starts after the previous marker (or at line 0)
        const inputStart = i === 0 ? 0 : currentMarkerLines[i - 1] + 1;
        // Cell input ends BEFORE this marker (exclusive)
        const inputEnd = markerLine;

        rebuildMappings.push({
          ...originalMapping,
          inputRange: { from: inputStart, to: inputEnd },
          outputMarkerLine: markerLine,
          // Update state from the latest cell data (for execution status indicators)
          state: newCell?.get("state"),
        });
      }

      mappingsRef.current = rebuildMappings;

      // Now detect what actually changed in cell inputs
      const changes: Array<{
        from: number;
        to: number;
        insert: string;
      }> = [];

      // Helper to convert line position to character offset
      const charOffsetForLine = (lineNum: number): number => {
        let pos = 0;
        for (let i = 0; i < lineNum && i < currentDoc.lines; i++) {
          pos += currentDoc.line(i + 1).length + 1; // +1 for newline
        }
        return pos;
      };

      // Check each cell for input changes
      for (const mapping of rebuildMappings) {
        const oldCell = lastCells.get(mapping.cellId);
        const newCell = updatedCells.get(mapping.cellId);

        // Get input content from store
        const oldInput = oldCell?.get("input") ?? "";
        const newInput = newCell?.get("input") ?? "";

        // Skip if cell input hasn't changed in store
        if (oldInput === newInput) {
          continue;
        }

        // Extract current document content for this cell
        const docLines: string[] = [];
        for (
          let lineNum = mapping.inputRange.from;
          lineNum < mapping.inputRange.to;
          lineNum++
        ) {
          if (lineNum + 1 <= currentDoc.lines) {
            docLines.push(currentDoc.line(lineNum + 1).text);
          }
        }
        const docContent = docLines.join("\n");

        // Only sync if document doesn't already match the new store value
        // (avoids overwriting user edits that we just sent)
        if (docContent === newInput) {
          continue;
        }

        // Split into lines for granular comparison
        const oldLines = oldInput === "" ? [] : oldInput.split("\n");
        const newLines = newInput === "" ? [] : newInput.split("\n");

        // Compare line by line and generate changes
        for (
          let lineIdx = 0;
          lineIdx < Math.max(oldLines.length, newLines.length);
          lineIdx++
        ) {
          const oldLine = oldLines[lineIdx];
          const newLine = newLines[lineIdx];

          if (oldLine === newLine) {
            continue;
          }

          const absLineNum = mapping.inputRange.from + lineIdx;
          const fromPos = charOffsetForLine(absLineNum);

          let toPos: number;
          let insertText: string;

          if (oldLine !== undefined && newLine !== undefined) {
            toPos = charOffsetForLine(absLineNum + 1);
            insertText = newLine + "\n";
          } else if (oldLine === undefined && newLine !== undefined) {
            toPos = fromPos;
            insertText = newLine + "\n";
          } else if (oldLine !== undefined && newLine === undefined) {
            toPos = charOffsetForLine(absLineNum + 1);
            insertText = "";
          } else {
            continue;
          }

          changes.push({
            from: fromPos,
            to: toPos,
            insert: insertText,
          });
        }
      }

      // Track which cells have changed outputs or state
      const changedOutputCellIds = new Set<string>();

      // Update outputs from store
      for (let i = 0; i < rebuildMappings.length; i++) {
        const mapping = rebuildMappings[i];
        const oldCell = lastCells.get(mapping.cellId);
        const newCell = updatedCells.get(mapping.cellId);
        if (newCell) {
          const outputData = newCell.get("output");
          const outputs: any[] = [];
          if (outputData) {
            let outputIndex = 0;
            while (true) {
              const message = outputData.get(`${outputIndex}`);
              if (!message) break;
              const plainMessage = message.toJS?.() ?? message;
              outputs.push(plainMessage);
              outputIndex += 1;
            }
          }

          const oldOutputs = mapping.outputs ?? [];
          const outputsStr = JSON.stringify(outputs);
          const oldOutputsStr = JSON.stringify(oldOutputs);

          if (
            oldOutputs.length !== outputs.length ||
            oldOutputsStr !== outputsStr
          ) {
            changedOutputCellIds.add(mapping.cellId);
          }
          mapping.outputs = outputs;

          // Check if state changed (for gutter update)
          const oldState = oldCell?.get("state");
          const newState = newCell?.get("state");
          if (oldState !== newState) {
            hasStateChange = true;
          }
        }
      }

      // Dispatch changes
      if (
        changes.length > 0 ||
        changedOutputCellIds.size > 0 ||
        hasStateChange
      ) {
        const txSpec: any = {};

        if (changes.length > 0) {
          changes.reverse();
          txSpec.changes = changes;
        }

        if (changedOutputCellIds.size > 0) {
          txSpec.effects = outputsChangedEffect.of(changedOutputCellIds);
        }

        // Even if only state changed (no content/output changes), we need to dispatch
        // to trigger gutter re-evaluation. An empty dispatch will still cause a re-render.
        viewRef.current!.dispatch(txSpec);
      }

      // Update tracked cells for next comparison
      lastCellsRef.current = updatedCells;
    };

    store.on("change", handleChange);

    return () => {
      store.removeListener("change", handleChange);
    };
  }, []); // Store is stable for the lifetime of this component

  // Handle font size changes
  useEffect(() => {
    if (!viewRef.current || !hasEditor) return;

    const container = containerRef.current;
    if (!container) return;

    container.style.fontSize = `${props.font_size}px`;
    // Set CSS variable for gutter sizing (gutter font size = editor font size - 1)
    container.style.setProperty("--editor-font-size", `${props.font_size}px`);
  }, [props.font_size, hasEditor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear any pending debounced changes
      if (debouncedChangeRef.current) {
        clearTimeout(debouncedChangeRef.current);
        debouncedChangeRef.current = null;
      }
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = undefined;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={EDITOR_STYLE}
      className="jupyter-single-file-editor"
    />
  );
});

SingleFileEditor.displayName = "SingleFileEditor";
