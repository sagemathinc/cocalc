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
import useResizeObserver from "use-resize-observer";

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
  const resize = useResizeObserver({
    ref: readOnly || !focused ? undefined : divRef,
  });
  const resizeRef = useRef<Function | null>(null);

  function getOuterChromeHeight(): number {
    const elt = outerRef.current;
    if (elt == null) return 0;
    const style = getComputedStyle(elt);
    const toNumber = (value: string): number => Number.parseFloat(value) || 0;
    return (
      toNumber(style.paddingTop) +
      toNumber(style.paddingBottom) +
      toNumber(style.borderTopWidth) +
      toNumber(style.borderBottomWidth)
    );
  }

  function measureFocusedHeight(): number | undefined {
    // Use divRef (inner div, no fixed height) so scrollHeight reflects
    // actual content — including collapsed child margins like the
    // InputPrompt's margin-top. outerRef.scrollHeight can't be used
    // because its fixed height prevents detecting shrink.
    const inner = divRef.current;
    if (inner == null) return;
    return Math.max(
      MIN_HEIGHT,
      Math.ceil(inner.scrollHeight + getOuterChromeHeight()),
    );
  }

  function measureUnfocusedHeight(): number | undefined {
    // Use divRef (inner div) since outerRef has minHeight:100% which
    // prevents detecting shrink when content gets smaller.
    const inner = divRef.current;
    if (inner == null) return;
    return Math.max(
      MIN_HEIGHT,
      Math.ceil(inner.scrollHeight + getOuterChromeHeight()),
    );
  }

  // Store current element.h in a ref so the resize callback always
  // compares against the latest value (avoids stale closure).
  const elementHRef = useRef<number>(element.h ?? 0);
  elementHRef.current = element.h ?? 0;

  useEffect(() => {
    if (readOnly || !focused) {
      resizeRef.current = null;
      return;
    }

    const shrinkElement = debounce(() => {
      if (actions.in_undo_mode() && element.str == getValueRef.current?.()) {
        return;
      }
      const h = measureFocusedHeight();
      if (h == null) return;
      // Only update if the change is significant to prevent oscillation
      // from sub-pixel rounding differences.
      if (Math.abs(h - elementHRef.current) > 2) {
        actions.setElement({
          obj: { id: element.id, h },
          commit: false,
        });
      }
    }, 250);

    resizeRef.current = () => {
      if (actions.in_undo_mode() && element.str == getValueRef?.current?.()) {
        return;
      }
      const newHeight = measureFocusedHeight();
      if (newHeight == null) return;
      if (newHeight > elementHRef.current) {
        shrinkElement.cancel();
        actions.setElement({
          obj: { id: element.id, h: newHeight },
          commit: false,
        });
      } else if (newHeight < elementHRef.current) {
        shrinkElement();
      }
    };

    resizeRef.current?.();

    // Deferred re-measurement: CodeMirror and other focused children
    // may not have fully laid out in the first frame.
    const raf = requestAnimationFrame(() => resizeRef.current?.());

    return () => {
      shrinkElement.cancel();
      cancelAnimationFrame(raf);
    };
  }, [element.id, canvasScale, editFocus, readOnly, focused]);

  useEffect(() => {
    resizeRef.current?.();
  }, [resize]);

  // Re-measure height when losing focus, since the unfocused render has
  // different dimensions (no ControlBar, InputStatic instead of Input, etc.)
  useEffect(() => {
    if (focused || readOnly) return;
    const inner = divRef.current;
    if (inner == null) return;
    if (typeof ResizeObserver === "undefined") return;
    let lastH = element.h ?? 0;
    const measure = () => {
      const h = measureUnfocusedHeight();
      if (h == null) return;
      if (Math.abs(h - lastH) > 2) {
        lastH = h;
        actions.setElement({ obj: { id: element.id, h }, commit: true });
      }
    };
    // Observe the inner div — outerRef has minHeight:100% so it
    // won't shrink, but divRef reflects actual content changes.
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    measure();
    const isRunning =
      element.data?.runState != null && element.data?.runState !== "done";
    const timeout = isRunning
      ? undefined
      : setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      if (timeout != null) clearTimeout(timeout);
    };
  }, [focused, element.id, canvasScale, element.data?.runState]);

  return (
    <div
      ref={outerRef}
      style={{
        ...getStyle(element),
        minHeight: "100%",
        height: "auto",
        overflowY: "visible",
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
