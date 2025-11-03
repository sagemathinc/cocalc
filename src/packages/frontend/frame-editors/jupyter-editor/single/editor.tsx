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
import {
  createOutputDecorationsField,
  createOutputsChangedEffect,
} from "./decorations";
import type { OutputWidgetContext } from "./output";
import {
  cellMergeEffect,
  createCellExecutionKeyHandler,
  createCellMergingFilter,
  createMarkerProtectionFilter,
  createPasteDetectionFilter,
  createRangeDeletionFilter,
  pasteDetectionEffect,
  rangeDeletionEffect,
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
  // Local StateEffect instance - prevents cross-notebook interference when multiple notebooks are open
  const outputsChangedEffectRef = useRef(createOutputsChangedEffect());
  const lastCellsRef = useRef<Map<string, any> | null>(null);
  // Context ref that can be updated after view is created
  const contextRef = useRef<OutputWidgetContext>({});
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
  // Track cells with unsync'd edits (edits in doc but not yet in store)
  const unsyncedCellsRef = useRef<Set<string>>(new Set());
  // Track which line ranges changed in the document
  const changedLineRangesRef = useRef<Array<[number, number]>>([]);
  // Function to flush pending changes (exposed for keyboard handler)
  const flushPendingChangesRef = useRef<() => void>(() => {});
  // Track target cell for cursor movement after execution
  // Set by key handler, cleared by store listener after moving cursor
  const cursorTargetAfterExecutionRef = useRef<string | null>(null);
  // Track when last edit happened (triggers debounce effect)
  const [lastEditTime, setLastEditTime] = useState<number | null>(null);

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

      // Dispatch effect to update decorations using local effect instance
      if (viewRef.current) {
        viewRef.current.dispatch({
          effects: outputsChangedEffectRef.current.of(new Set([cellId])),
        });
      }
    },
    [],
  );

  // Flush pending edits to store (called before cell execution)
  const flushEditsToStore = React.useCallback(() => {
    if (!viewRef.current || !lastCellsRef.current) {
      return;
    }

    const view = viewRef.current;
    const doc = view.state.doc;
    const lastCells = lastCellsRef.current;
    const store = props.actions.store;
    if (!store) return;

    const cellList = store.get("cell_list");
    if (!cellList) return;

    // Split document by marker pattern (works even with corrupted markers)
    // Pattern: ZWS followed by anything until newline
    const fullContent = doc.sliceString(0, doc.length);
    const markerPattern = /\u200b[^\n]*/g;
    const parts = fullContent.split(markerPattern);

    // Extract cell content for each cell
    const cellsToUpdate: Array<{ cellId: string; content: string }> = [];

    for (let cellIdx = 0; cellIdx < cellList.size; cellIdx++) {
      const cellId = cellList.get(cellIdx);
      if (!cellId) continue; // Skip if cellId is undefined

      // Get the content part for this cell
      let cellContent = parts[cellIdx] || "";

      // Remove leading/trailing newlines
      cellContent = cellContent
        .replace(/^\n/, "") // Remove leading newline
        .replace(/\n$/, ""); // Remove trailing newline

      // DEFENSIVE: Strip any lingering markers from cell content
      // (should not happen, but prevents corruption if it does)
      cellContent = cellContent.replace(/\u200b[^\n]*/g, "");

      const originalCell = lastCells.get(cellId);
      const originalContent = originalCell?.get("input") ?? "";

      // Only update if content actually changed
      if (cellContent !== originalContent) {
        cellsToUpdate.push({ cellId, content: cellContent });
      }
    }

    // Update lastCellsRef and store
    let updatedLastCells = lastCells;
    for (const { cellId, content } of cellsToUpdate) {
      const cell = updatedLastCells.get(cellId);
      if (cell) {
        updatedLastCells = updatedLastCells.set(
          cellId,
          cell.set("input", content),
        );
      }
    }

    if (updatedLastCells !== lastCells) {
      lastCellsRef.current = updatedLastCells;
      // Sync to store
      for (const { cellId, content } of cellsToUpdate) {
        props.actions.set_cell_input(cellId, content, true);
      }
    }
  }, [props.actions]);

  // Debounce effect: 500ms after user stops typing, flush edits to store
  useEffect(() => {
    if (lastEditTime === null) return;

    const timer = setTimeout(() => {
      flushEditsToStore();

      // Mark cells as synced (no longer unsynced)
      for (const [fromLine, toLine] of changedLineRangesRef.current) {
        const cellsInRange = getCellsInRange(
          mappingsRef.current,
          fromLine,
          toLine,
        );
        cellsInRange.forEach((c) => unsyncedCellsRef.current.delete(c.cellId));
      }
      changedLineRangesRef.current = [];
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [lastEditTime]);

  // Handle document changes - just track them for flushing later
  const handleDocumentChange = React.useCallback(() => {
    // For now, we don't do anything on every keystroke.
    // Edits accumulate in the document until flushed (via Shift+Return, etc.)
  }, []);

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

    // Callback for inserting cells in single-file mode
    // This is defined before creating the output field so it can be passed to OutputWidget
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
        // Silently handle error - user action will not complete but won't crash
      }
    };

    // Create the output decoration field with mappings reference (only once)
    // Now includes insert cell widget as part of the OutputWidget
    if (!outputDecoFieldRef.current) {
      // Initialize context (view will be added after EditorView is created)
      contextRef.current = {
        actions: props.actions,
        name: props.actions.name,
        project_id: props.project_id,
        directory: props.path,
        // Insert cell context - now part of output widget
        onInsertCell: handleInsertCell,
        // view will be set below after EditorView is created
      };

      outputDecoFieldRef.current = createOutputDecorationsField(
        mappingsRef,
        contextRef.current,
        mdEditIdsRef,
        toggleMarkdownEdit,
        outputsChangedEffectRef.current,
      );
    }

    // Note: We no longer need a separate insertCellDecoFieldRef since the insert cell widget
    // is now rendered as part of the OutputWidget (in output.tsx)
    // This simplifies the decoration model and fixes gutter alignment issues

    // Create the CodeMirror editor
    const state = EditorState.create({
      doc: content,
      extensions: [
        createCellGutterWithLabels(mappingsRef, props.actions), // Gutter with In[]/Out[] labels and line numbers
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle),
        python(),
        outputDecoFieldRef.current,
        // Insert cell widget is now part of OutputWidget, no separate decoration field needed
        createMarkerProtectionFilter(), // Prevent deletion of output marker lines
        createCellMergingFilter(mappingsRef, props.actions), // Detect boundary deletions and merge cells
        createRangeDeletionFilter(mappingsRef, props.actions), // Detect range deletions across cells
        createPasteDetectionFilter(mappingsRef, props.actions), // Detect pasted multi-cell content
        createCellExecutionKeyHandler(
          mappingsRef,
          props.actions,
          flushPendingChangesRef,
          cursorTargetAfterExecutionRef,
        ), // Shift+Return to execute cells
        // Change listener for editing
        EditorView.updateListener.of((update) => {
          // Check for cell merge effects (triggered by boundary deletions)
          for (const tr of update.transactions) {
            for (const effect of tr.effects) {
              if (effect.is(cellMergeEffect)) {
                const { sourceCellId, targetCellId } = effect.value;

                // Use sourceContent from the effect (extracted by the merge filter)
                // Don't re-extract from document - it might be out of sync
                const { sourceContent } = effect.value;

                // Get target cell content from store (not document)
                const store = props.actions.store;
                const cells = store.get("cells");
                if (!cells) {
                  return;
                }

                const targetCell = cells.get(targetCellId);
                if (!targetCell) {
                  return;
                }

                const targetContent = targetCell.get("input") ?? "";

                // Merge order depends on whether deletion was at start or end
                const { isAtEnd } = effect.value;

                let mergedContent: string;
                if (isAtEnd) {
                  // Delete at end: source comes BEFORE target
                  // (source was at end of its cell, moving into beginning of target cell)
                  mergedContent =
                    sourceContent +
                    (targetContent && sourceContent ? "\n" : "") +
                    targetContent;
                } else {
                  // Delete at start: target comes BEFORE source
                  // (target was at start of its cell, source moving into it from before)
                  mergedContent =
                    targetContent +
                    (targetContent && sourceContent ? "\n" : "") +
                    sourceContent;
                }

                // Update target cell with merged content
                props.actions.set_cell_input(targetCellId, mergedContent, true);

                // Delete source cell
                props.actions.delete_cells([sourceCellId]);
              } else if (effect.is(rangeDeletionEffect)) {
                // Handle range deletions across multiple cells
                const effectData = effect.value;

                if (effectData.type === "delete") {
                  // Delete this cell completely
                  props.actions.delete_cells([effectData.cellId]);
                } else if (effectData.type === "modify") {
                  // Update cell with remaining content
                  props.actions.set_cell_input(
                    effectData.cellId,
                    effectData.newContent,
                    true,
                  );
                }
              } else if (effect.is(pasteDetectionEffect)) {
                // Handle pasted multi-cell content
                const pastedCells = effect.value;

                // Create cells in order from the pasted content
                // Get current cell list to determine insertion positions
                const store = props.actions.store;
                const cellList = store.get("cell_list");
                const currentLength = cellList ? cellList.size : 0;

                for (let i = 0; i < pastedCells.length; i++) {
                  const pastedCell = pastedCells[i];
                  // Insert at position: currentLength + index means append at end in sequence
                  const insertPosition = currentLength + i;
                  const newCellId = props.actions.insert_cell_at(
                    insertPosition,
                    false, // Don't save individually, we'll batch them
                  );

                  // Set the cell input with the pasted content
                  // The cell is unexecuted (no exec_count) and has no outputs
                  props.actions.set_cell_input(
                    newCellId,
                    pastedCell.content,
                    false, // Don't save
                  );

                  // If pasted cell type is not "code", change the cell type
                  if (pastedCell.cellType === "markdown") {
                    props.actions.set_cell_type(newCellId, "markdown", false);
                  } else if (pastedCell.cellType === "raw") {
                    props.actions.set_cell_type(newCellId, "raw", false);
                  }
                }

                // Save all created cells at once
                props.actions._sync?.();
              }
            }
          }

          // Track user edits (input/delete, not store-sync changes)
          for (const tr of update.transactions) {
            if (tr.isUserEvent("input") || tr.isUserEvent("delete")) {
              // Track which lines changed
              const startState = tr.startState;
              tr.changes.iterChanges((fromPos, toPos, _fromA, _toA) => {
                const fromLine = startState.doc.lineAt(fromPos).number - 1; // 0-indexed
                const toLine = startState.doc.lineAt(toPos).number - 1; // 0-indexed
                changedLineRangesRef.current.push([fromLine, toLine]);

                // Find which cells are affected by this change
                const cellsInRange = getCellsInRange(
                  mappingsRef.current,
                  fromLine,
                  toLine,
                );
                cellsInRange.forEach((c) => {
                  unsyncedCellsRef.current.add(c.cellId);
                });
              });

              // Trigger debounce - 500ms after user stops typing
              setLastEditTime(Date.now());
            }
          }

          // Store the pending update so we can flush it on demand
          if (update.docChanged) {
            pendingUpdateRef.current = update;
          }
        }),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    // Add view to context so widgets can request measurement updates
    contextRef.current.view = viewRef.current;

    setHasEditor(true);

    // Set up the flush function for pending changes
    flushPendingChangesRef.current = () => {
      // Clear the debounce timeout
      if (debouncedChangeRef.current) {
        clearTimeout(debouncedChangeRef.current);
        debouncedChangeRef.current = null;
      }

      // Flush any pending edits to store before execution
      flushEditsToStore();

      // Clear pending update
      pendingUpdateRef.current = null;
    };
  }, [storeUpdateTrigger, handleDocumentChange, flushEditsToStore]); // Only re-run when explicitly triggered (initial data load)

  // Set up store listener for content updates (separate effect)
  useEffect(() => {
    const store = props.actions.store;
    if (!store) return;

    const handleChange = () => {
      if (!viewRef.current) {
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

      if (!lastCellsRef.current) {
        return;
      }

      // CRITICAL: Compute everything from store, never scan document for structure
      // Build the correct document and mappings from store
      let { content: newContent, mappings: newMappings } =
        buildDocumentFromNotebook(updatedCells, updatedCellList);

      // CRITICAL FIX: Preserve document content for cells with unsync'd edits
      // If any cells have pending edits not yet synced to store, keep their document content
      if (unsyncedCellsRef.current.size > 0) {
        const oldDoc = viewRef.current.state.doc;
        const lines: string[] = [];

        for (const mapping of newMappings) {
          if (unsyncedCellsRef.current.has(mapping.cellId)) {
            // This cell has unsync'd edits - preserve from document
            for (
              let lineIdx = mapping.inputRange.from;
              lineIdx < mapping.inputRange.to;
              lineIdx++
            ) {
              if (lineIdx + 1 <= oldDoc.lines) {
                lines.push(oldDoc.line(lineIdx + 1).text);
              }
            }
          } else {
            // Cell was synced - use store content
            lines.push(...mapping.source);
          }
          // Add marker
          const markerChar =
            mapping.cellType === "markdown"
              ? "m"
              : mapping.cellType === "raw"
              ? "r"
              : "c";
          lines.push(`${ZERO_WIDTH_SPACE}${markerChar}`);
        }
        newContent = lines.join("\n");
      }

      // Update our tracked mappings to the newly computed ones
      mappingsRef.current = newMappings;

      // Check if document content changed
      const oldDocForComparison = viewRef.current.state.doc;
      const oldContent = oldDocForComparison.sliceString(
        0,
        oldDocForComparison.length,
      );
      const contentChanged = oldContent !== newContent;

      // Check which cells have changed outputs
      const changedOutputCellIds = new Set<string>();
      for (const mapping of newMappings) {
        const oldCell = lastCellsRef.current.get(mapping.cellId);
        const newCell = updatedCells.get(mapping.cellId);

        const oldOutputs = oldCell?.get("output");
        const newOutputs = newCell?.get("output");

        // Use Immutable.js equals for comparison if available
        let outputsChanged = false;
        if (oldOutputs && newOutputs) {
          outputsChanged = !oldOutputs.equals?.(newOutputs);
        } else {
          outputsChanged = oldOutputs !== newOutputs;
        }

        if (outputsChanged) {
          changedOutputCellIds.add(mapping.cellId);
        }
      }

      // Dispatch changes
      if (contentChanged || changedOutputCellIds.size > 0) {
        const txSpec: any = {};

        if (contentChanged) {
          // Full document replacement - atomic and safe
          // CodeMirror optimizes this internally with smart diffing
          txSpec.changes = {
            from: 0,
            to: oldDocForComparison.length,
            insert: newContent,
          };

          // CRITICAL: When content changes, we MUST trigger decoration recomputation
          // Add all cells to changedOutputCellIds so decorations are recalculated
          // This is necessary because mappings changed (cell indices shifted due to merge)
          for (const mapping of newMappings) {
            changedOutputCellIds.add(mapping.cellId);
          }
        }

        if (changedOutputCellIds.size > 0) {
          txSpec.effects =
            outputsChangedEffectRef.current.of(changedOutputCellIds);
        }

        viewRef.current.dispatch(txSpec);

        // Restore focus after output-only changes
        if (changedOutputCellIds.size > 0 && !contentChanged) {
          setTimeout(() => {
            viewRef.current?.focus();
          }, 0);
        }
      }

      // Move cursor to target cell if execution completed
      if (cursorTargetAfterExecutionRef.current && viewRef.current) {
        const targetCellId = cursorTargetAfterExecutionRef.current;
        const targetCell = newMappings.find((m) => m.cellId === targetCellId);
        if (targetCell) {
          const cursorPos = viewRef.current.state.doc.line(
            targetCell.inputRange.from + 1,
          ).from;
          viewRef.current.dispatch({
            selection: { anchor: cursorPos },
          });
          cursorTargetAfterExecutionRef.current = null;
        }
      }

      // Update tracked cells
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
