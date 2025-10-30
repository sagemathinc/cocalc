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
 */
export function computeOutputDecorations(
  state: EditorState,
  mappings: CellMapping[],
  context: OutputWidgetContext = {},
): RangeSet<Decoration> {
  const decorations: Array<[Decoration, number, number]> = [];

  for (const mapping of mappings) {
    const { cellId, outputs, cellType, outputMarkerLine } = mapping;

    // Bounds check: ensure marker line exists (in case it was deleted)
    if (outputMarkerLine + 1 > state.doc.lines) {
      // Line doesn't exist, skip this decoration
      continue;
    }

    // Find the position of the ZWS marker line in the document
    // outputMarkerLine is 0-indexed, doc.line() expects 1-indexed
    const line = state.doc.line(outputMarkerLine + 1);
    const from = line.from;
    const to = line.to;

    // Create decoration that replaces the ZWS line with output widget
    // This is created for ALL cells, even those without outputs
    // (the OutputWidget will render empty for cells with no outputs)
    const decoration = Decoration.replace({
      widget: new OutputWidget(cellId, outputs ?? [], cellType, context),
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
 */
export function createOutputDecorationsField(
  mappingsRef: {
    current: CellMapping[];
  },
  context: OutputWidgetContext = {},
): StateField<RangeSet<Decoration>> {
  // Cache decorations by cellId to reuse them when outputs don't change
  const decorationCache = new Map<
    string,
    { decoration: Decoration; outputsJson: string }
  >();

  return StateField.define<RangeSet<Decoration>>({
    create(state) {
      return computeOutputDecorations(state, mappingsRef.current, context);
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

        for (const mapping of mappingsRef.current) {
          const { cellId, outputs, cellType, outputMarkerLine } = mapping;

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
            // Create new decoration for this cell (even if outputs is empty)
            const decoration = Decoration.replace({
              widget: new OutputWidget(
                cellId,
                outputs ?? [],
                cellType,
                context,
              ),
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
