/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Jupyter cells


- Locked: a locked cell can't have the input/output hidden/shown and can't have the input
  code changed.  However, you *can* run the code and interact with widgets.  This makes
  a notebook with a bunch of locked cells useful for users to share something without consumers
  breaking it.   Also, it matches with jupyter notebook.
*/

import { debounce } from "lodash";
import { useEffect, useRef, useState } from "react";
import { useAsyncEffect } from "use-async-effect";

import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { codemirrorMode } from "@cocalc/frontend/file-extensions";
import { useFrameContext } from "../../hooks";
import { Element } from "../../types";
import useEditFocus from "../edit-focus";
import { getMode } from "./actions";
import ControlBar from "./control";
import Input from "./input";
import InputPrompt from "./input-prompt";
import InputStatic from "./input-static";
import Output from "./output";
import getStyle from "./style";

const MIN_HEIGHT = 78;

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
  cursors?: { [account_id: string]: any[] };
  readOnly?: boolean;
}

export default function Code({
  element,
  focused,
  canvasScale,
  cursors,
  readOnly,
}: Props) {
  const { hideInput, hideOutput } = element.data ?? {};
  const [editFocus, setEditFocus] = useEditFocus(false);
  const { actions, project_id, path } = useFrameContext();
  const [mode, setMode] = useState<any>(codemirrorMode("py"));
  const isMountedRef = useIsMountedRef();
  useAsyncEffect(async () => {
    let mode;
    try {
      mode = await getMode({ project_id, path });
    } catch {
      // this can fail, e.g., if user closes file before finishing opening it
      return;
    }
    if (isMountedRef.current) {
      setMode(mode);
    }
  }, []);

  const renderInput = () => {
    if (hideInput) return;
    if (!element.locked && (focused || cursors != null) && !readOnly) {
      return (
        <div className="nodrag">
          <Input
            cursors={cursors}
            isFocused={focused && editFocus}
            element={element}
            focused={focused}
            canvasScale={canvasScale}
            onFocus={() => setEditFocus(true)}
            mode={mode}
            getValueRef={getValueRef}
          />
        </div>
      );
    }
    return <InputStatic element={element} mode={mode} />;
  };
  const outerRef = useRef<HTMLDivElement>(null);
  const divRef = useRef<any>(null);
  const getValueRef = useRef<any>(null);

  // Track element.h in a ref so callbacks always see the latest value.
  const elementHRef = useRef<number>(element.h ?? 0);
  elementHRef.current = element.h ?? 0;

  function getOuterChrome(): { border: number; padding: number } {
    const outer = outerRef.current;
    if (outer == null) return { border: 0, padding: 0 };
    const style = getComputedStyle(outer);
    const toNum = (v: string) => Number.parseFloat(v) || 0;
    return {
      border: toNum(style.borderTopWidth) + toNum(style.borderBottomWidth),
      padding: toNum(style.paddingTop) + toNum(style.paddingBottom),
    };
  }

  // Measure using outerRef.scrollHeight (accurate, blocks margin collapse).
  // When focused, outerRef has height:100% so scrollHeight can't drop
  // below element.h — measureHeightInner provides a fallback for shrink.
  function measureHeight(): number | undefined {
    const outer = outerRef.current;
    if (outer == null) return;
    const { border } = getOuterChrome();
    return Math.max(MIN_HEIGHT, Math.ceil(outer.scrollHeight + border));
  }

  // Fallback measurement via divRef for detecting shrink in focused mode.
  // May slightly underestimate due to margin collapse, but correctly
  // detects "content got smaller than element.h".
  function measureHeightInner(): number | undefined {
    const inner = divRef.current;
    if (inner == null) return;
    const { border, padding } = getOuterChrome();
    return Math.max(MIN_HEIGHT, Math.ceil(inner.scrollHeight + padding + border));
  }

  // Single unified height-sync effect for both focused and unfocused modes.
  // Observes both outerRef (for scrollHeight measurement) and divRef (to
  // catch internal content changes that may not resize outerRef when it has
  // a fixed height in focused mode).
  useEffect(() => {
    if (readOnly) return;
    const outer = outerRef.current;
    const inner = divRef.current;
    if (outer == null || inner == null) return;
    if (typeof ResizeObserver === "undefined") return;

    const shrink = debounce(() => {
      if (actions.in_undo_mode() && element.str == getValueRef.current?.()) {
        return;
      }
      // Use inner measurement for shrink (outerRef can't shrink in focused mode).
      const h = focused ? measureHeightInner() : measureHeight();
      if (h != null && Math.abs(h - elementHRef.current) > 2) {
        actions.setElement({ obj: { id: element.id, h }, commit: !focused });
      }
    }, 250);

    const sync = () => {
      if (actions.in_undo_mode() && element.str == getValueRef?.current?.()) {
        return;
      }
      const h = measureHeight();
      if (h == null) return;
      if (h > elementHRef.current) {
        // Grow immediately so bounding box matches content.
        // Commit when unfocused so collaborators see the change.
        shrink.cancel();
        actions.setElement({ obj: { id: element.id, h }, commit: !focused });
      } else if (!focused && h < elementHRef.current - 2) {
        // Shrink with a delay to avoid oscillation.
        // Only shrink when unfocused — in focused mode, outerRef has
        // height:100% so scrollHeight can't drop, and using the inner
        // measurement causes oscillation. Shrink happens on blur.
        shrink();
      }
    };

    const observer = new ResizeObserver(sync);
    observer.observe(outer);
    observer.observe(inner);

    // Immediate measurement.
    sync();
    // Deferred: catch children that lay out after the first frame
    // (e.g. CodeMirror editor, output rendering).
    const raf = requestAnimationFrame(sync);

    // For unfocused cells, disconnect after 5s unless a computation is
    // running (output may still be streaming in).
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (!focused) {
      const isRunning =
        element.data?.runState != null && element.data?.runState !== "done";
      if (!isRunning) {
        timeout = setTimeout(() => observer.disconnect(), 5000);
      }
    }

    return () => {
      observer.disconnect();
      shrink.cancel();
      cancelAnimationFrame(raf);
      if (timeout != null) clearTimeout(timeout);
    };
  }, [focused, element.id, canvasScale, editFocus, readOnly, element.data?.runState]);

  return (
    <div
      ref={outerRef}
      style={{
        ...getStyle(element),
        ...(focused
          ? { height: "100%", overflowY: "hidden" }
          : { minHeight: "100%", height: "auto", overflowY: "visible" }),
      }}
    >
      <div ref={divRef}>
        {!hideInput && <InputPrompt element={element} />}
        {renderInput()}
        {!hideOutput && element.data?.output && (
          <Output element={element} onClick={() => setEditFocus(true)} />
        )}
        {focused && !readOnly && <ControlBar element={element} canvasScale={canvasScale} />}
      </div>
    </div>
  );
}
