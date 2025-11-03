/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Output decorations for single-file view.

This module handles:
- Computing output decorations from cell mappings
- Creating output decoration state field
- Protecting marker lines from user deletion
*/

import {
  EditorState,
  RangeSet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

import { OutputWidget, type OutputWidgetContext } from "./output";
import {
  MarkdownDisplayWidget,
  MarkdownEditWidget,
  RawDisplayWidget,
  type MarkdownWidgetContext,
} from "./markdown-widgets";
import type { CellMapping } from "./state";

/**
 * StateEffect to signal that cell outputs have changed.
 * Carries a Set of cell IDs that actually changed to avoid recomputing all decorations.
 */
export const outputsChangedEffect = StateEffect.define<Set<string>>();

/**
 * Compute output decorations from cell mappings.
 * Creates Decoration.replace() for each cell's output marker line.
 * Even cells without outputs get a decoration to ensure consistent document structure.
 * Handles code cells (with outputs), markdown cells (with display/edit widgets), and raw cells.
 */
export function computeOutputDecorations(
  state: EditorState,
  mappings: CellMapping[],
  context: OutputWidgetContext = {},
  mdEditIdsRef?: { current: Set<string> },
  onToggleMarkdownEdit?: (cellId: string, isEdit: boolean) => void,
): RangeSet<Decoration> {
  const decorations: Array<[Decoration, number, number]> = [];
  const mdEditIds = mdEditIdsRef?.current ?? new Set<string>();

  for (const mapping of mappings) {
    const { cellId, outputs, cellType, outputMarkerLine, source } = mapping;

    // Bounds check: ensure marker line exists (in case it was deleted)
    if (outputMarkerLine + 1 > state.doc.lines) {
      // Line doesn't exist, skip this decoration
      continue;
    }

    // Find the position of the marker line in the document
    // outputMarkerLine is 0-indexed, doc.line() expects 1-indexed
    const line = state.doc.line(outputMarkerLine + 1);
    const from = line.from;
    const to = line.to;

    let widget:
      | OutputWidget
      | MarkdownDisplayWidget
      | MarkdownEditWidget
      | RawDisplayWidget;

    if (cellType === "markdown") {
      // Markdown cell: show display or edit widget
      const isEditing = mdEditIds.has(cellId);
      const sourceText = source.join("\n");

      // Context for markdown widgets (includes insert cell callback)
      const mdContext: MarkdownWidgetContext = {
        actions: context.actions,
        project_id: context.project_id,
        onInsertCell: context.onInsertCell,
      };

      if (isEditing) {
        widget = new MarkdownEditWidget(
          cellId,
          sourceText,
          (content: string) => {
            // Save the markdown content to the cell and exit edit mode
            if (context.actions) {
              context.actions.set_cell_input(cellId, content, true);
            }
            if (onToggleMarkdownEdit) {
              onToggleMarkdownEdit(cellId, false);
            }
          },
          14,
          context.project_id,
          context.directory,
          context.view,
          mdContext,
        );
      } else {
        widget = new MarkdownDisplayWidget(
          cellId,
          sourceText,
          () => {
            // Enter edit mode on double-click
            if (onToggleMarkdownEdit) {
              onToggleMarkdownEdit(cellId, true);
            }
          },
          context.view,
          mdContext,
        );
      }
    } else if (cellType === "raw") {
      // Raw cell: show plaintext display
      const sourceText = source.join("\n");
      const mdContext: MarkdownWidgetContext = {
        actions: context.actions,
        project_id: context.project_id,
        onInsertCell: context.onInsertCell,
      };
      widget = new RawDisplayWidget(
        cellId,
        sourceText,
        context.view,
        mdContext,
      );
    } else {
      // Code cell: show output widget (existing logic)
      widget = new OutputWidget(cellId, outputs ?? [], cellType, context);
    }

    // Create decoration that replaces the marker line with appropriate widget
    const decoration = Decoration.replace({
      widget,
      block: true, // Full-width block
    });

    decorations.push([decoration, from, to]);
  }

  // Build RangeSet from decorations
  return RangeSet.of(
    decorations.map(([deco, from, to]) => deco.range(from, to)),
    true, // sorted
  );
}

/**
 * StateField for managing output decorations.
 * Automatically recomputes when document or mappings change.
 * Handles code cells (with outputs), markdown cells (with display/edit widgets), and raw cells.
 */
export function createOutputDecorationsField(
  mappingsRef: {
    current: CellMapping[];
  },
  context: OutputWidgetContext = {},
  mdEditIdsRef?: { current: Set<string> },
  onToggleMarkdownEdit?: (cellId: string, isEdit: boolean) => void,
): StateField<RangeSet<Decoration>> {
  // Cache decorations by cellId to reuse them when outputs don't change
  const decorationCache = new Map<
    string,
    { decoration: Decoration; outputsJson: string }
  >();

  return StateField.define<RangeSet<Decoration>>({
    create(state) {
      return computeOutputDecorations(
        state,
        mappingsRef.current,
        context,
        mdEditIdsRef,
        onToggleMarkdownEdit,
      );
    },

    update(decorations, tr) {
      // Extract which cells actually had output changes
      const changedCellIds = tr.effects
        .filter((e) => e.is(outputsChangedEffect))
        .flatMap((e) => Array.from(e.value));

      if (changedCellIds.length > 0) {
        // Recompute decorations, but reuse cached ones for unchanged cells
        const changedSet = new Set(changedCellIds);
        const newDecorations: Array<[Decoration, number, number]> = [];
        const mdEditIds = mdEditIdsRef?.current ?? new Set<string>();

        for (const mapping of mappingsRef.current) {
          const { cellId, outputs, cellType, outputMarkerLine, source } =
            mapping;

          // Bounds check: ensure marker line exists (in case it was deleted)
          if (outputMarkerLine + 1 > tr.state.doc.lines) {
            // Line doesn't exist, skip this decoration
            continue;
          }

          const outputsJson = JSON.stringify(outputs ?? []);
          const cached = decorationCache.get(cellId);

          const line = tr.state.doc.line(outputMarkerLine + 1);
          const from = line.from;
          const to = line.to;

          // Create new decoration only if cell changed, otherwise reuse cache
          if (
            changedSet.has(cellId) ||
            !cached ||
            cached.outputsJson !== outputsJson
          ) {
            // Create new decoration for this cell
            let widget:
              | OutputWidget
              | MarkdownDisplayWidget
              | MarkdownEditWidget
              | RawDisplayWidget;

            if (cellType === "markdown") {
              // Markdown cell: show display or edit widget
              const isEditing = mdEditIds.has(cellId);
              const sourceText = source.join("\n");

              // Context for markdown widgets (includes insert cell callback)
              const mdContext: MarkdownWidgetContext = {
                actions: context.actions,
                project_id: context.project_id,
                onInsertCell: context.onInsertCell,
              };

              if (isEditing) {
                widget = new MarkdownEditWidget(
                  cellId,
                  sourceText,
                  (content: string) => {
                    // Save the markdown content to the cell and exit edit mode
                    if (context.actions) {
                      context.actions.set_cell_input(cellId, content, true);
                    }
                    if (onToggleMarkdownEdit) {
                      onToggleMarkdownEdit(cellId, false);
                    }
                  },
                  14,
                  context.project_id,
                  context.directory,
                  context.view,
                  mdContext,
                );
              } else {
                widget = new MarkdownDisplayWidget(
                  cellId,
                  sourceText,
                  () => {
                    // Enter edit mode on double-click
                    if (onToggleMarkdownEdit) {
                      onToggleMarkdownEdit(cellId, true);
                    }
                  },
                  context.view,
                  mdContext,
                );
              }
            } else if (cellType === "raw") {
              // Raw cell: show plaintext display
              const sourceText = source.join("\n");
              const mdContext: MarkdownWidgetContext = {
                actions: context.actions,
                project_id: context.project_id,
                onInsertCell: context.onInsertCell,
              };
              widget = new RawDisplayWidget(
                cellId,
                sourceText,
                context.view,
                mdContext,
              );
            } else {
              // Code cell: show output widget
              widget = new OutputWidget(
                cellId,
                outputs ?? [],
                cellType,
                context,
              );
            }

            const decoration = Decoration.replace({
              widget,
              block: true,
            });
            newDecorations.push([decoration, from, to]);
            decorationCache.set(cellId, { decoration, outputsJson });
          } else {
            // Reuse cached decoration (same widget, no recreation)
            newDecorations.push([cached.decoration, from, to]);
          }
        }

        return RangeSet.of(
          newDecorations.map(([deco, from, to]) => deco.range(from, to)),
          true,
        );
      }

      // For document changes (input editing), just map existing decorations to new positions
      // This is a cheap operation compared to recomputing all widgets
      if (tr.docChanged) {
        return decorations.map(tr.changes);
      }

      // No changes to decorations
      return decorations;
    },

    provide: (f) => EditorView.decorations.from(f),
  });
}
