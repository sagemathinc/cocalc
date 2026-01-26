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
import { EditorState, RangeSet, StateField, Text } from "@codemirror/state";
import { Decoration, EditorView, highlightActiveLine } from "@codemirror/view";
import { diff_main } from "@cocalc/util/dmp";

import {
  React,
  useCallback,
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
import { applyCellMergeEffect } from "./merge-handler";
import { buildDocumentFromNotebook, type CellMapping } from "./state";
import {
  findCellAtLine,
  getCellsInRange,
  realignMappingsWithDocument,
} from "./utils";

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

const CELL_WIDGET_SELECTORS = [
  ".jupyter-output-widget",
  ".jupyter-markdown-display-widget",
  ".jupyter-markdown-edit-widget",
  ".jupyter-raw-widget",
] as const;

export const SingleFileEditor: React.FC<Props> = React.memo((props: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const mappingsRef = useRef<CellMapping[]>([]);
  const pendingSelectionRestoreRef = useRef<{
    cellId?: string;
    lineOffset?: number;
    column?: number;
    fallbackPos?: number;
  } | null>(null);
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
  // Track which cell widgets should display selection highlight
  const selectedCellWidgetIdsRef = useRef<Set<string>>(new Set());

  const setCellWidgetSelectionState = useCallback(
    (cellId: string, isSelected: boolean) => {
      const container = containerRef.current;
      if (!container) return;

      for (const selector of CELL_WIDGET_SELECTORS) {
        container
          .querySelectorAll<HTMLElement>(
            `${selector}[data-cell-id="${cellId}"]`,
          )
          .forEach((element) => {
            element.classList.toggle(
              "jupyter-cell-widget-selected",
              isSelected,
            );
          });
      }
    },
    [],
  );

  const refreshSelectionHighlights = useCallback(() => {
    if (selectedCellWidgetIdsRef.current.size === 0) {
      return;
    }
    selectedCellWidgetIdsRef.current.forEach((cellId) => {
      setCellWidgetSelectionState(cellId, true);
    });
  }, [setCellWidgetSelectionState]);

  const applySelectionHighlights = useCallback(
    (nextSelection: Set<string>) => {
      const previous = selectedCellWidgetIdsRef.current;

      previous.forEach((cellId) => {
        if (!nextSelection.has(cellId)) {
          setCellWidgetSelectionState(cellId, false);
        }
      });

      nextSelection.forEach((cellId) => {
        if (!previous.has(cellId)) {
          setCellWidgetSelectionState(cellId, true);
        }
      });

      selectedCellWidgetIdsRef.current = new Set(nextSelection);
    },
    [setCellWidgetSelectionState],
  );

  const restorePendingSelection = useCallback(() => {
    if (!viewRef.current || !pendingSelectionRestoreRef.current) return;

    const pending = pendingSelectionRestoreRef.current;
    pendingSelectionRestoreRef.current = null;

    const doc = viewRef.current.state.doc;
    let anchor: number | null = null;

    if (pending.cellId) {
      const mapping = mappingsRef.current.find(
        (m) => m.cellId === pending.cellId,
      );
      if (mapping) {
        const totalLines = Math.max(
          mapping.inputRange.to - mapping.inputRange.from,
          1,
        );
        const relativeLine = Math.max(
          0,
          Math.min(pending.lineOffset ?? 0, totalLines - 1),
        );
        const targetLineNumber = mapping.inputRange.from + relativeLine;
        if (targetLineNumber + 1 <= doc.lines) {
          const line = doc.line(targetLineNumber + 1);
          const lineLength = line.to - line.from;
          const column = Math.max(0, Math.min(pending.column ?? 0, lineLength));
          anchor = Math.min(line.from + column, line.to);
        } else if (mapping.outputMarkerLine + 1 <= doc.lines) {
          anchor = doc.line(mapping.outputMarkerLine + 1).from;
        }
      }
    }

    if (anchor == null && pending.fallbackPos != null) {
      anchor = Math.max(0, Math.min(pending.fallbackPos, doc.length));
    }

    if (anchor != null) {
      viewRef.current.dispatch({
        selection: { anchor, head: anchor },
      });
    }
  }, []);

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

      const mapping = mappingsRef.current.find((m) => m.cellId === cellId);
      if (mapping?.cellType === "markdown") {
        // Markdown cell content is managed via markdown widgets; skip doc syncing
        continue;
      }

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

  // Debounce effect: 500ms after user stops typing, trigger flush
  // CRITICAL FIX: Don't clear unsyncedCellsRef here - that happens in store listener after merge
  useEffect(() => {
    if (lastEditTime === null) return;

    const timer = setTimeout(() => {
      flushEditsToStore();
      // NOTE: Don't clear unsyncedCellsRef here - it's cleared after store update completes
      // This prevents the race condition where typing happens between flush and update
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
                applyCellMergeEffect(props.actions, effect.value);
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
            mappingsRef.current = realignMappingsWithDocument(
              update.state.doc,
              mappingsRef.current,
            );
          }

          if (update.selectionSet) {
            const doc = update.state.doc;
            const nextSelectedCells = new Set<string>();
            for (const mapping of mappingsRef.current) {
              const markerLineNumber = mapping.outputMarkerLine + 1;
              if (markerLineNumber > doc.lines) continue;
              const markerLine = doc.line(markerLineNumber);
              for (const range of update.state.selection.ranges) {
                if (range.empty) continue;
                const start = Math.min(range.from, range.to);
                const end = Math.max(range.from, range.to);
                if (start < markerLine.to && end > markerLine.from) {
                  nextSelectedCells.add(mapping.cellId);
                  break;
                }
              }
            }
            applySelectionHighlights(nextSelectedCells);
          }

          const shouldRefreshSelection =
            selectedCellWidgetIdsRef.current.size > 0 &&
            (update.docChanged ||
              update.viewportChanged ||
              update.transactions.some((tr) =>
                tr.effects.some((effect) =>
                  effect.is(outputsChangedEffectRef.current),
                ),
              ));
          if (shouldRefreshSelection) {
            refreshSelectionHighlights();
          }

          if (pendingSelectionRestoreRef.current) {
            const isUserEdit = update.transactions.some(
              (tr) => tr.isUserEvent("input") || tr.isUserEvent("delete"),
            );
            if (!isUserEdit) {
              restorePendingSelection();
            }
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
  }, [
    storeUpdateTrigger,
    handleDocumentChange,
    flushEditsToStore,
    applySelectionHighlights,
    refreshSelectionHighlights,
  ]); // Only re-run when explicitly triggered (initial data load)

  // Helper function to apply diff-based updates instead of full replacement
  // Inspired by packages/frontend/codemirror/extensions/set-value-nojump.ts
  // This preserves cursor position, scroll position, history, and unsynced edits
  const applyDiffBasedUpdate = React.useCallback(
    (oldContent: string, newContent: string, txSpec: any): boolean => {
      if (!viewRef.current) return false;

      // Compute diff between old and new content using Google Diff-Match-Patch
      const diffs = diff_main(oldContent, newContent);

      // If too many chunks, fall back to full replacement
      // (same strategy as CodeMirror 5's setValueNoJump extension)
      if (diffs.length >= 500) {
        return false; // Signal to do full replacement
      }

      // Apply diffs incrementally using CodeMirror's changes API
      const changes: Array<{ from: number; to: number; insert: string }> = [];
      let pos = 0; // Current position in the document

      for (const [type, text] of diffs) {
        if (type === 0) {
          // No change - advance position
          pos += text.length;
        } else if (type === -1) {
          // Deletion
          const endPos = pos + text.length;
          changes.push({ from: pos, to: endPos, insert: "" });
          // Note: pos stays the same for deletions
        } else if (type === 1) {
          // Insertion
          changes.push({ from: pos, to: pos, insert: text });
          pos += text.length;
        }
      }

      // Only apply if there are actual changes
      if (changes.length > 0) {
        txSpec.changes = changes;
        return true; // Successfully applied diff-based update
      }

      // No changes needed - content is already up to date
      return newContent === oldContent ? true : false;
    },
    [],
  );

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

      // CRITICAL FIX: Extract local unsynced content BEFORE rebuilding document
      // This preserves typing that happened after flushEditsToStore() but before this listener fired
      // Map of cellId -> source lines for unsynced cells
      const localInputs: Record<string, string[]> = {};
      if (unsyncedCellsRef.current.size > 0 && viewRef.current) {
        const oldDoc = viewRef.current.state.doc;
        for (const cellId of unsyncedCellsRef.current) {
          const mapping = mappingsRef.current.find((m) => m.cellId === cellId);
          if (mapping && mapping.cellType !== "markdown") {
            // Extract lines from document for this unsynced cell
            const cellLines: string[] = [];
            for (
              let lineIdx = mapping.inputRange.from;
              lineIdx < mapping.inputRange.to;
              lineIdx++
            ) {
              if (lineIdx + 1 <= oldDoc.lines) {
                cellLines.push(oldDoc.line(lineIdx + 1).text);
              }
            }
            if (cellLines.length > 0) {
              localInputs[cellId] = cellLines;
            }
          }
        }
      }

      // CRITICAL: Compute everything from store, never scan document for structure
      // Build the correct document and mappings from store
      // Pass localInputs so unsynced cells use their local content
      let { content: newContent, mappings: newMappings } =
        buildDocumentFromNotebook(updatedCells, updatedCellList, localInputs);

      // NOTE: Old preservation logic removed - now done via localInputs in buildDocumentFromNotebook
      // This is cleaner and happens before document rebuild

      // Check if document content changed
      const oldDocForComparison = viewRef.current.state.doc;
      const oldContent = oldDocForComparison.sliceString(
        0,
        oldDocForComparison.length,
      );
      const contentChanged = oldContent !== newContent;
      const previousMappings = mappingsRef.current;

      // CRITICAL FIX: Only mark cells as synced if they're NO LONGER in unsyncedCellsRef
      // AND the store content matches what we sent. For now, we'll mark as synced after dispatch.
      const cellsBeingMerged = new Set(unsyncedCellsRef.current);

      // Check which cells need decoration/gutter updates (outputs, exec counts, state, markdown input)
      const cellsNeedingUpdate = new Set<string>();
      for (const mapping of newMappings) {
        const oldCell = lastCellsRef.current.get(mapping.cellId);
        const newCell = updatedCells.get(mapping.cellId);

        const oldOutputs = oldCell?.get("output");
        const newOutputs = newCell?.get("output");
        const oldExecCount = oldCell?.get("exec_count");
        const newExecCount = newCell?.get("exec_count");
        const oldState = oldCell?.get("state");
        const newState = newCell?.get("state");
        const oldInput = oldCell?.get("input");
        const newInput = newCell?.get("input");
        const markdownInputChanged =
          mapping.cellType === "markdown" && oldInput !== newInput;

        // Use Immutable.js equals for comparison if available
        let outputsChanged = false;
        if (oldOutputs && newOutputs) {
          outputsChanged = !oldOutputs.equals?.(newOutputs);
        } else {
          outputsChanged = oldOutputs !== newOutputs;
        }

        if (
          outputsChanged ||
          oldExecCount !== newExecCount ||
          oldState !== newState ||
          markdownInputChanged
        ) {
          cellsNeedingUpdate.add(mapping.cellId);
        }
      }

      // Dispatch changes
      if (contentChanged || cellsNeedingUpdate.size > 0) {
        const txSpec: any = {};

        if (contentChanged) {
          if (!cursorTargetAfterExecutionRef.current && viewRef.current) {
            const currentState = viewRef.current.state;
            const anchor = currentState.selection.main.anchor;
            const line = currentState.doc.lineAt(anchor);
            const lineIndex = line.number - 1;
            const cellAtLine = findCellAtLine(previousMappings, lineIndex);
            if (cellAtLine) {
              pendingSelectionRestoreRef.current = {
                cellId: cellAtLine.cellId,
                lineOffset: lineIndex - cellAtLine.inputRange.from,
                column: anchor - line.from,
              };
            } else {
              pendingSelectionRestoreRef.current = {
                fallbackPos: anchor,
              };
            }
          } else {
            pendingSelectionRestoreRef.current = null;
          }

          // CRITICAL FIX: Try diff-based update FIRST
          // This preserves cursor position and undo history instead of full replacement
          const oldContent = oldDocForComparison.sliceString(
            0,
            oldDocForComparison.length,
          );
          const diffApplied = applyDiffBasedUpdate(
            oldContent,
            newContent,
            txSpec,
          );

          if (diffApplied) {
            // Diff-based update was successful - realign mappings to new positions
            // Mappings may shift due to insertions/deletions
            const newDocText = Text.of(newContent.split("\n"));
            newMappings = realignMappingsWithDocument(newDocText, newMappings);
            // Mark all cells for decoration update since positions may have changed
            for (const mapping of newMappings) {
              cellsNeedingUpdate.add(mapping.cellId);
            }
          } else {
            // Fall back to full replacement if diff is too large (500+ chunks)
            // or if diff-based update failed for some reason
            txSpec.changes = {
              from: 0,
              to: oldDocForComparison.length,
              insert: newContent,
            };
            // Align mappings with the new document content so decorations and gutters remain accurate
            const newDocText = Text.of(newContent.split("\n"));
            newMappings = realignMappingsWithDocument(newDocText, newMappings);
            // CRITICAL: When content changes, we MUST trigger decoration/gutter recomputation
            // Add all cells to cellsNeedingUpdate so decorations are recalculated
            // This is necessary because mappings changed (cell indices shifted due to merge)
            for (const mapping of newMappings) {
              cellsNeedingUpdate.add(mapping.cellId);
            }
          }
        } else {
          pendingSelectionRestoreRef.current = null;
        }

        // Ensure decorations and gutters read the latest mapping data
        mappingsRef.current = newMappings;

        if (cellsNeedingUpdate.size > 0) {
          txSpec.effects =
            outputsChangedEffectRef.current.of(cellsNeedingUpdate);
        }

        viewRef.current.dispatch(txSpec);

        // CRITICAL FIX: Clear unsyncedCellsRef AFTER dispatch completes
        // This ensures that if the user typed more while this listener was running,
        // those new edits won't be lost on the next store update
        for (const cellId of cellsBeingMerged) {
          unsyncedCellsRef.current.delete(cellId);
        }

        // Restore focus after output-only changes
        if (cellsNeedingUpdate.size > 0 && !contentChanged) {
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

  return <div ref={containerRef} className="jupyter-single-file-editor" />;
});

SingleFileEditor.displayName = "SingleFileEditor";
