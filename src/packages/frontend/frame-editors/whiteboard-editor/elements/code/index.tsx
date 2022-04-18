/* Jupyter cells


- Locked: a locked cell can't have the input/output hidden/shown and can't have the input
  code changed.  However, you *can* run the code and interact with widgets.  This makes
  a notebook with a bunch of locked cells useful for users to share something without consumers
  breaking it.   Also, it matches with jupyter notebook.
*/

import { useEffect, useRef, useState } from "react";
import { Element } from "../../types";
import ControlBar from "./control";
import Input from "./input";
import InputPrompt from "./input-prompt";
import InputStatic from "./input-static";
import Output from "./output";
import getStyle from "./style";
import useEditFocus from "../edit-focus";
import { useAsyncEffect } from "use-async-effect";
import { getMode } from "./actions";
import { codemirrorMode } from "@cocalc/frontend/file-extensions";
import { useFrameContext } from "../../hooks";
import useResizeObserver from "use-resize-observer";
import { debounce } from "lodash";

const EXTRA_HEIGHT = 30;
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
  useAsyncEffect(async () => {
    setMode(await getMode({ project_id, path }));
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
  const divRef = useRef<any>(null);
  const getValueRef = useRef<any>(null);
  const resize = useResizeObserver({
    ref: readOnly || !focused ? undefined : divRef, // only listen if necessary!
  });
  const resizeRef = useRef<Function | null>(null);
  useEffect(() => {
    if (readOnly || !focused) {
      resizeRef.current = null;
      return;
    }
    const shrinkElement = debounce(() => {
      // for why "element.str == getValueRef.current?.()" see comment in ../text.tsx
      if (actions.in_undo_mode() && element.str == getValueRef.current?.()) {
        return;
      }
      const elt = divRef.current;
      if (elt == null) return;
      const h = Math.max(
        MIN_HEIGHT,
        elt.getBoundingClientRect()?.height / canvasScale + EXTRA_HEIGHT
      );
      actions.setElement({
        obj: { id: element.id, h },
        commit: false,
      });
    }, 250);

    resizeRef.current = () => {
      if (actions.in_undo_mode() && element.str == getValueRef?.current?.()) {
        return;
      }
      const elt = divRef.current;
      if (elt == null) return;
      const newHeight = Math.max(
        MIN_HEIGHT,
        elt.getBoundingClientRect()?.height / canvasScale + EXTRA_HEIGHT
      );
      if (newHeight > element.h) {
        shrinkElement.cancel();
        actions.setElement({
          obj: { id: element.id, h: newHeight },
          commit: false,
        });
      } else if (newHeight < element.h) {
        shrinkElement();
      }
    };

    resizeRef.current?.();

    return () => {
      shrinkElement.cancel();
    };
  }, [element.id, canvasScale, editFocus, readOnly]);

  useEffect(() => {
    resizeRef.current?.();
  }, [resize]);

  return (
    <div style={{ ...getStyle(element), height: "100%" }}>
      <div ref={divRef}>
        {!hideInput && <InputPrompt element={element} />}
        {renderInput()}
        {!hideOutput && element.data?.output && (
          <Output element={element} onClick={() => setEditFocus(true)} />
        )}
        {focused && !readOnly && <ControlBar element={element} />}
      </div>
    </div>
  );
}
