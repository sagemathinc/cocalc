/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Marker manager for the LaTeX rich-edit feature. Subscribes to a
CodeMirror instance, runs the viewport parser on a debounce, and
maintains a live registry of `cm.markText({replacedWith})` markers
that reconciles against fresh parse output.

Reconciliation strategy (validated in the Phase 2.0 spike — see
src/docs/latex-rich-edit-design.md):

 1. For each existing live marker, resolve its current range via
    `marker.find()`. `null` → marker was cleared (e.g. by
    clearOnEnter); dispose its host + React root.
 2. Pair surviving markers with fresh descriptors by key
    `(line, ch, type, source)`. `.find()` returns positions that have
    already followed buffer edits elsewhere, so this match survives
    ordinary insert/delete.
 3. Pairs whose buffer text still equals the captured `source` →
    leave the marker, host, and root alive. No DOM thrash.
 4. Unmatched live entries → dispose. Unmatched fresh descriptors →
    create new markers — UNLESS the cursor is currently inside the
    range (edit-zone exclusion).

This is what `attachWidgetManager` returns a cleanup function for:
clears handlers, disposes every live mark, defers React unmount one
tick to avoid render-cycle races.
*/

import * as CodeMirror from "codemirror";
import { createRoot, Root } from "react-dom/client";

import { ai_gen_formula } from "@cocalc/frontend/codemirror/extensions/ai-formula";
import {
  FrameContext,
  IFrameContext,
} from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

import { parseViewport } from "./parser";
import { WidgetDescriptor, WidgetType } from "./types";
import { AI_EDITABLE_TYPES, renderWidget } from "./widget-renderer";

const WIDGET_CLASS = "cc-latex-rich-edit-widget";
const DEBOUNCE_MS = 80;
const VIEWPORT_HYSTERESIS_LINES = 50;

interface LiveMark {
  marker: CodeMirror.TextMarker;
  host: HTMLElement;
  root: Root;
  source: string;
  type: WidgetType;
}

function keyOf(
  line: number,
  ch: number,
  type: WidgetType,
  source: string,
): string {
  return `${line}:${ch}:${type}:${source}`;
}

function cursorIsInRange(
  cursor: CodeMirror.Position,
  from: CodeMirror.Position,
  to: CodeMirror.Position,
): boolean {
  if (cursor.line < from.line || cursor.line > to.line) return false;
  if (cursor.line === from.line && cursor.ch < from.ch) return false;
  if (cursor.line === to.line && cursor.ch > to.ch) return false;
  return true;
}

/**
 * Attach the widget manager to a CodeMirror instance. Returns a
 * dispose function that clears every live mark, unmounts roots
 * (deferred one tick), and detaches event handlers.
 */
export function attachWidgetManager(
  cm: CodeMirror.Editor,
  frameContext: IFrameContext,
): () => void {
  let live: LiveMark[] = [];
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const disposeMark = (m: LiveMark) => {
    try {
      m.marker.clear();
    } catch {
      // already cleared (e.g. via clearOnEnter)
    }
    const root = m.root;
    // Defer unmount to avoid race with React render cycle.
    setTimeout(() => {
      try {
        root.unmount();
      } catch {
        // ignored
      }
    }, 0);
    try {
      m.host.remove();
    } catch {
      // ignored
    }
  };

  const createMark = (d: WidgetDescriptor): LiveMark => {
    const host = document.createElement("span");
    host.className = `${WIDGET_CLASS} ${WIDGET_CLASS}--${d.type}`;
    host.setAttribute("role", "button");
    host.setAttribute("tabindex", "0");
    host.setAttribute("aria-label", `LaTeX: ${d.source}`);

    // `let` so the onActivate closure can refer to the marker created
    // below.
    let marker: CodeMirror.TextMarker | undefined;

    const onActivate = () => {
      if (marker == null) return;
      const range = marker.find();
      if (range == null || !("from" in range)) return;
      // Clear → setCursor → focus. clearOnEnter on the same marker
      // remains as the keyboard-entry fallback.
      try {
        marker.clear();
      } catch {
        // already cleared
      }
      cm.setCursor(range.from);
      cm.focus();
    };

    // Math widgets get an AI-edit closure (pencil button → AI dialog
    // → replace source). The accept path is race-safe: we look up
    // the current marker range via `marker.find()` AFTER the dialog
    // resolves (it can take seconds), bail on null, and detect cancel
    // by checking whether the dialog returned the original text
    // unchanged (ai-formula.tsx resolves cancel that way).
    const onAiEdit = AI_EDITABLE_TYPES.has(d.type)
      ? async () => {
          if (marker == null) return;
          const range = marker.find();
          if (range == null || !("from" in range)) return;
          const originalSource = cm.getRange(range.from, range.to);
          let result: string;
          try {
            result = await ai_gen_formula({
              mode: "tex",
              text: originalSource,
              project_id: frameContext.project_id,
            });
          } catch {
            // dialog dismissed via error / X — bail silently
            return;
          }
          // Cancel returns the original text unchanged.
          if (result === originalSource) return;
          // Re-check marker after dialog (may have been edited or
          // dissolved by the user in the meantime).
          const range2 = marker.find();
          if (range2 == null || !("from" in range2)) return;
          const stillOriginal =
            cm.getRange(range2.from, range2.to) === originalSource;
          if (!stillOriginal) {
            // User or collaborator edited while dialog was open;
            // refuse to clobber.
            return;
          }
          cm.replaceRange(result, range2.from, range2.to);
        }
      : undefined;

    const root = createRoot(host);
    // createRoot mounts live outside the editor's <FrameContext.Provider> —
    // wrap so any context-dependent hooks see the right value.
    root.render(
      <FrameContext.Provider value={frameContext}>
        {renderWidget(d, onActivate, onAiEdit)}
      </FrameContext.Provider>,
    );

    marker = cm.markText(d.from, d.to, {
      replacedWith: host,
      clearOnEnter: true,
      // false: CM ignores mouse events on the widget; the widget's
      // own onMouseDown drives activation. With true, CM would try to
      // handle the click but can't position its cursor inside the
      // widget-replaced range.
      handleMouseEvents: false,
      inclusiveLeft: false,
      inclusiveRight: false,
      atomic: false,
    });

    return { marker, host, root, source: d.source, type: d.type };
  };

  const rescan = () => {
    if (disposed) return;

    const viewport = cm.getViewport();
    const lineCount = cm.lineCount();
    const fromLine = Math.max(0, viewport.from - VIEWPORT_HYSTERESIS_LINES);
    const toLine = Math.min(viewport.to + VIEWPORT_HYSTERESIS_LINES, lineCount);

    const fresh = parseViewport(cm, fromLine, toLine);
    const cursor = cm.getCursor() ?? { line: -1, ch: -1 };

    const freshByKey = new Map<string, WidgetDescriptor>();
    for (const d of fresh) {
      freshByKey.set(keyOf(d.from.line, d.from.ch, d.type, d.source), d);
    }

    const survivors: LiveMark[] = [];
    const consumed = new Set<string>();

    for (const m of live) {
      const range = m.marker.find();
      if (range == null || !("from" in range) || !("to" in range)) {
        disposeMark(m);
        continue;
      }
      const key = keyOf(range.from.line, range.from.ch, m.type, m.source);
      const d = freshByKey.get(key);
      if (d == null || consumed.has(key)) {
        disposeMark(m);
        continue;
      }
      // Belt-and-braces: verify the buffer text still equals the
      // captured source.
      const currentText = cm.getRange(range.from, range.to);
      if (currentText !== m.source) {
        disposeMark(m);
        continue;
      }
      survivors.push(m);
      consumed.add(key);
    }

    for (const d of fresh) {
      const key = keyOf(d.from.line, d.from.ch, d.type, d.source);
      if (consumed.has(key)) continue;
      // Edit-zone exclusion: don't fight the user while the cursor
      // is inside (or at the boundary of) the would-be marker range.
      if (cursorIsInRange(cursor, d.from, d.to)) continue;
      survivors.push(createMark(d));
      consumed.add(key);
    }

    live = survivors;
  };

  const schedule = () => {
    if (scheduled !== null) clearTimeout(scheduled);
    scheduled = setTimeout(() => {
      scheduled = null;
      rescan();
    }, DEBOUNCE_MS);
  };

  const onChange = () => schedule();
  const onViewport = () => schedule();
  // cursorActivity is required so that a previously-skipped (cursor-
  // in-range) descriptor gets a marker created once the cursor leaves.
  // The reconciler makes this cheap — survivors don't get touched.
  const onCursor = () => schedule();
  cm.on("change", onChange);
  cm.on("viewportChange", onViewport);
  cm.on("cursorActivity", onCursor);

  // Initial scan.
  rescan();

  return () => {
    disposed = true;
    cm.off("change", onChange);
    cm.off("viewportChange", onViewport);
    cm.off("cursorActivity", onCursor);
    if (scheduled !== null) {
      clearTimeout(scheduled);
      scheduled = null;
    }
    for (const m of live) disposeMark(m);
    live = [];
  };
}
