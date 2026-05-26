/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
LatexCodemirrorEditor — wraps the standard CodemirrorEditor with a top
toolbar (`RichEditToolbar`) hosting the rich-edit Segmented control
and format-action buttons. The underlying CodemirrorEditor is
unchanged. Wired in via `latex-editor/editor.ts` as the `cm` frame's
component.

When the user is in Rich mode (the default), this wrapper attaches
the widget manager to the live CM instance. The manager parses the
visible viewport, mints `cm.markText({replacedWith})` markers for
recognized LaTeX constructs, and reconciles across rescans via
`marker.find()` so scrolling and unrelated edits don't churn DOM.

Stability note
--------------
`useFrameContext()` returns a fresh object identity on every parent
render (frame-tree.tsx constructs the context value as an object
literal). If we put `frameContext` or `editor_actions` in the
useEffect deps, the manager would dispose and re-attach on every
parent render — wiping the reconciler's live-marker registry. That
flicker was the exact failure mode validated and fixed during the
Phase 2.0 spike. We capture both through refs and depend only on the
stable identifiers `richEditMode` + `props.id`.

See `src/docs/latex-rich-edit-design.md` for the full design.
*/

import { useEffect, useRef } from "react";

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

import { CodemirrorEditor } from "../../code-editor/codemirror-editor";
import { EditorComponentProps } from "../../frame-tree/types";
import { RichEditToolbar } from "./toolbar";
import { attachWidgetManager } from "./widget-manager";

const WRAPPER_STYLE = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
} as const;

const CM_CONTAINER_STYLE = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
} as const;

export function LatexCodemirrorEditor(props: EditorComponentProps) {
  const frameContext = useFrameContext();

  // Refs to hold the latest unstable references. Updated on every
  // render but never trigger the widget-manager-attach effect.
  const frameContextRef = useRef(frameContext);
  const editorActionsRef = useRef(props.editor_actions);
  frameContextRef.current = frameContext;
  editorActionsRef.current = props.editor_actions;

  // Per-frame view mode. Default Rich. When the user toggles the
  // Segmented control, set_frame_data triggers a re-render of this
  // wrapper, which re-reads here and re-runs the effect below.
  const richEditMode: boolean =
    props.editor_actions?._get_frame_data?.(props.id, "richEditMode", true) !==
    false;

  // Attach the widget manager when "Rich" is selected.
  useEffect(() => {
    if (!richEditMode) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const tryAttach = () => {
      if (cancelled) return;
      // CodemirrorEditor stores the live cm instance on
      // editor_actions._cm[id] after init (see
      // code-editor/actions.ts ~1598). We poll briefly because CM
      // init runs in a useEffect on CodemirrorEditor and may not be
      // ready on the first render of this wrapper.
      //
      // IMPORTANT: look up _cm[props.id] DIRECTLY — do not fall back
      // to _get_cm(props.id). That helper returns the active/most-
      // recent CM when the requested id isn't registered yet, which
      // when two LaTeX source frames are open would attach this
      // wrapper's manager to a DIFFERENT pane's CM (duplicate
      // markers there, none here, and unmounting either pane could
      // dispose widgets on the wrong one).
      const cm = editorActionsRef.current?._cm?.[props.id];
      if (cm) {
        dispose = attachWidgetManager(cm, frameContextRef.current);
      } else {
        setTimeout(tryAttach, 100);
      }
    };
    tryAttach();
    return () => {
      cancelled = true;
      dispose?.();
    };
    // Deliberately exclude frameContext + editor_actions: captured
    // via refs above; including them would re-fire this effect on
    // every parent render and wipe the marker manager's live
    // registry (validated in the Phase 2.0 spike).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richEditMode, props.id]);

  return (
    <div style={WRAPPER_STYLE} className="cc-latex-rich-edit-frame">
      <RichEditToolbar id={props.id} editor_actions={props.editor_actions} />
      <div style={CM_CONTAINER_STYLE}>
        <CodemirrorEditor {...(props as any)} />
      </div>
    </div>
  );
}
