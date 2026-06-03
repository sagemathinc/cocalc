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

import { extractMacros } from "./latex-macros";
import { MathMacrosContext } from "./math-macros-context";
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
  /** Serialized payload last rendered into `root`. The reconcile key
   * deliberately excludes the payload (so a marker survives sibling
   * edits that renumber/reindent it), so we track it here to detect
   * when a survivor must be re-rendered with a fresh descriptor. */
  payloadKey: string;
  /** Re-render this mark's React root with a new descriptor, reusing the
   * existing host, root, and activation closures. */
  rerender: (d: WidgetDescriptor) => void;
}

/** Stable serialization of a descriptor's payload for change detection. */
function payloadKeyOf(d: WidgetDescriptor): string {
  return d.payload == null ? "" : JSON.stringify(d.payload);
}

function keyOf(
  line: number,
  ch: number,
  type: WidgetType,
  source: string,
): string {
  return `${line}:${ch}:${type}:${source}`;
}

interface ActiveRange {
  from: number;
  to: number;
}

/**
 * The "edit zone": the line range covered by the primary selection
 * (collapsed cursor → a single line). Any widget whose line span
 * intersects this range dissolves to raw source so the whole line —
 * and the whole of any multi-line construct the cursor sits inside —
 * is editable as plain LaTeX.
 */
function spanIntersectsActive(
  from: CodeMirror.Position,
  to: CodeMirror.Position,
  active: ActiveRange,
): boolean {
  return from.line <= active.to && to.line >= active.from;
}

// Context window handed to the AI formula editor: up to CONTEXT_LINES
// lines before the formula (capped at CONTEXT_BEFORE_MAX_CHARS) and
// CONTEXT_LINES lines after. A `[FORMULA]` placeholder marks where the
// edited formula sits so the model can reason about its surroundings.
const CONTEXT_LINES = 5;
const CONTEXT_BEFORE_MAX_CHARS = 1000;

function surroundingContext(
  cm: CodeMirror.Editor,
  from: CodeMirror.Position,
  to: CodeMirror.Position,
): string {
  const lineCount = cm.lineCount();
  const beforeLines: string[] = [];
  for (let l = Math.max(0, from.line - CONTEXT_LINES); l < from.line; l++) {
    beforeLines.push(cm.getLine(l) ?? "");
  }
  let before = beforeLines.join("\n");
  if (before.length > CONTEXT_BEFORE_MAX_CHARS) {
    before = before.slice(before.length - CONTEXT_BEFORE_MAX_CHARS);
  }
  const afterLines: string[] = [];
  const afterEnd = Math.min(lineCount - 1, to.line + CONTEXT_LINES);
  for (let l = to.line + 1; l <= afterEnd; l++) {
    afterLines.push(cm.getLine(l) ?? "");
  }
  const after = afterLines.join("\n");
  return [before, "[FORMULA]", after].join("\n").trim();
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
  let disposed = false;

  // ---- Per-document macros ------------------------------------------
  // Parsed from the buffer's \newcommand/\def/etc. and handed to math
  // widgets so KaTeX previews match the real compile. Rescanned only on
  // buffer changes (not viewport scrolls). When the set changes, math
  // marks are disposed + recreated so they re-render with the new
  // macros (a preamble edit doesn't change a formula's source, so the
  // normal key-based reconcile would otherwise leave them stale).
  let currentMacros: Record<string, string> = {};
  let macrosKey = "";
  let needMacroScan = true;
  let macrosChanged = false;

  const ensureMacros = () => {
    if (!needMacroScan) return;
    const next = extractMacros(cm.getValue());
    const nextKey = JSON.stringify(next);
    if (nextKey !== macrosKey) {
      currentMacros = next;
      macrosKey = nextKey;
      macrosChanged = true;
    }
    needMacroScan = false;
  };

  // Deferred React unmounts, tracked so teardown is deterministic
  // (flushed synchronously on dispose) and never leaks a root.
  const pendingUnmounts = new Map<ReturnType<typeof setTimeout>, Root>();

  const scheduleUnmount = (root: Root) => {
    // Defer one tick to avoid unmounting inside a CM event / React
    // render cycle.
    const id = setTimeout(() => {
      pendingUnmounts.delete(id);
      try {
        root.unmount();
      } catch {
        // ignored
      }
    }, 0);
    pendingUnmounts.set(id, root);
  };

  const disposeMark = (m: LiveMark) => {
    try {
      m.marker.clear();
    } catch {
      // already cleared (e.g. via clearOnEnter)
    }
    try {
      m.host.remove();
    } catch {
      // ignored
    }
    scheduleUnmount(m.root);
  };

  const createMark = (d: WidgetDescriptor): LiveMark => {
    const host = document.createElement("span");
    host.className = `${WIDGET_CLASS} ${WIDGET_CLASS}--${d.type}`;
    host.setAttribute("role", "button");
    host.setAttribute("tabindex", "0");
    host.setAttribute("aria-label", `LaTeX: ${d.source}`);
    // Keep wide content (long bold runs, wide math/tables) from
    // blowing out the wrapped CM line: cap at the text column and let
    // prose wrap; inline-block children (math/tables) scroll instead.
    host.style.maxWidth = "100%";
    host.style.overflowWrap = "anywhere";
    // Display math / math envs render as a centered block — make the
    // host block-level so the centering spans the full line width
    // (otherwise an inline host shrinks to the formula and "centering"
    // is a no-op, leaving the formula left-aligned).
    if (d.type === "math-display" || d.type === "math-env") {
      host.style.display = "block";
    }

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

    // Keyboard activation: the host is focusable (role=button,
    // tabindex=0), so Enter/Space must dissolve it to raw source —
    // mirroring the mouse-down path in the Widget component. The AI
    // pencil's own keydown handler stops propagation, so focusing it
    // and pressing Enter edits instead of dissolving.
    host.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    });

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
          const contextText = surroundingContext(cm, range.from, range.to);
          let result: string;
          try {
            result = await ai_gen_formula({
              mode: "tex",
              project_id: frameContext.project_id,
              existingFormula: originalSource,
              contextText,
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
    // wrap so any context-dependent hooks see the right value. Shared by
    // the initial mount and survivor re-renders (renumbered list items
    // etc.) so both go through the same provider wrapping.
    const renderWith = (desc: WidgetDescriptor) => {
      root.render(
        <FrameContext.Provider value={frameContext}>
          <MathMacrosContext.Provider value={currentMacros}>
            {renderWidget(desc, onActivate, onAiEdit)}
          </MathMacrosContext.Provider>
        </FrameContext.Provider>,
      );
    };
    renderWith(d);

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

    return {
      marker,
      host,
      root,
      source: d.source,
      type: d.type,
      payloadKey: payloadKeyOf(d),
      rerender: renderWith,
    };
  };

  // ---- Parse cache --------------------------------------------------
  // Parsing the viewport is the expensive step; cursor moves don't
  // change the buffer, so we reuse the last parse for cursor-only
  // reconciles. `needParse` is raised by buffer/viewport changes and
  // lowered after a fresh parse.
  interface ParseCache {
    descriptors: WidgetDescriptor[];
  }
  let parseCache: ParseCache | null = null;
  let needParse = true;
  let lastActive: ActiveRange | null = null;

  const activeRange = (): ActiveRange => {
    const head = cm.getCursor("head");
    const anchor = cm.getCursor("anchor");
    if (head == null || anchor == null) {
      const c = cm.getCursor() ?? { line: -1, ch: 0 };
      return { from: c.line, to: c.line };
    }
    return {
      from: Math.min(head.line, anchor.line),
      to: Math.max(head.line, anchor.line),
    };
  };

  const ensureParse = (): ParseCache => {
    if (needParse || parseCache == null) {
      const viewport = cm.getViewport();
      const lineCount = cm.lineCount();
      const fromLine = Math.max(0, viewport.from - VIEWPORT_HYSTERESIS_LINES);
      const toLine = Math.min(viewport.to + VIEWPORT_HYSTERESIS_LINES, lineCount);
      parseCache = { descriptors: parseViewport(cm, fromLine, toLine) };
      needParse = false;
    }
    return parseCache;
  };

  const reconcile = (fresh: WidgetDescriptor[], active: ActiveRange) => {
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
      // Whole-construct edit zone: a live widget whose line span
      // touches the active selection dissolves to raw source. This is
      // the authority — it also disposes widgets the cursor has just
      // moved onto (the survivor loop previously had no cursor check,
      // so already-rendered lines never became editable).
      if (spanIntersectsActive(range.from, range.to, active)) {
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
      // The key matched on (position, type, source) but excludes the
      // payload, so a survivor can still carry a stale render when only
      // the payload changed — e.g. inserting an \item renumbers the
      // following chips, or switching itemize→enumerate changes their
      // markers, without touching their range/source. Re-render in that
      // case (cheap: skipped when the payload is unchanged).
      const freshPayloadKey = payloadKeyOf(d);
      if (freshPayloadKey !== m.payloadKey) {
        m.rerender(d);
        m.payloadKey = freshPayloadKey;
      }
      survivors.push(m);
      consumed.add(key);
    }

    for (const d of fresh) {
      const key = keyOf(d.from.line, d.from.ch, d.type, d.source);
      if (consumed.has(key)) continue;
      // Don't render inside the edit zone.
      if (spanIntersectsActive(d.from, d.to, active)) continue;
      survivors.push(createMark(d));
      consumed.add(key);
    }

    live = survivors;
  };

  const runReconcile = () => {
    if (disposed) return;
    ensureMacros();
    if (macrosChanged) {
      // Macro set changed → drop every live mark so all get recreated
      // below with the new macros. Not just math widgets: text-style
      // widgets can contain nested inline math (e.g. \textbf{$\R$}),
      // which also depends on the macro map via MathMacrosContext.
      for (const m of live) disposeMark(m);
      live = [];
      macrosChanged = false;
    }
    const parsed = ensureParse();
    const active = activeRange();
    reconcile(parsed.descriptors, active);
    lastActive = active;
  };

  // ---- Scheduling ---------------------------------------------------
  // Buffer/viewport changes need a re-parse → debounced. Cursor moves
  // only shift the edit zone → cheap rAF reconcile that reuses the
  // cached parse, with an early-out when the active line range is
  // unchanged (e.g. moving within a line).
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;

  const scheduleFull = () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runReconcile();
    }, DEBOUNCE_MS);
  };

  const scheduleFast = () => {
    if (!needParse && lastActive != null) {
      const active = activeRange();
      if (active.from === lastActive.from && active.to === lastActive.to) {
        return;
      }
    }
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      runReconcile();
    });
  };

  const onChange = () => {
    needParse = true;
    needMacroScan = true;
    scheduleFull();
  };
  const onViewport = () => {
    needParse = true;
    scheduleFull();
  };
  const onCursor = () => scheduleFast();
  cm.on("change", onChange);
  cm.on("viewportChange", onViewport);
  cm.on("cursorActivity", onCursor);

  // Initial scan.
  runReconcile();

  return () => {
    disposed = true;
    cm.off("change", onChange);
    cm.off("viewportChange", onViewport);
    cm.off("cursorActivity", onCursor);
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    for (const m of live) disposeMark(m);
    live = [];
    // Flush any deferred unmounts synchronously so teardown leaves no
    // orphaned roots.
    for (const [id, root] of pendingUnmounts) {
      clearTimeout(id);
      try {
        root.unmount();
      } catch {
        // ignored
      }
    }
    pendingUnmounts.clear();
  };
}
