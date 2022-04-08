/* Jupyter cells


- Locked: a locked cell can't have the input/output hidden/shown and can't have the input
  code changed.  However, you *can* run the code and interact with widgets.  This makes
  a notebook with a bunch of locked cells useful for users to share something without consumers
  breaking it.   Also, it matches with jupyter notebook.
*/

import { useMemo, useEffect, useRef, useState } from "react";
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
}

export default function Code({
  element,
  focused,
  canvasScale,
  cursors,
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
    if (!element.locked && (focused || cursors != null)) {
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
          />
        </div>
      );
    }
    return <InputStatic element={element} mode={mode} />;
  };
  const divRef = useRef<any>(null);
  const resize = useResizeObserver({ ref: divRef });
  const resizeIfNecessary = useMemo(() => {
    const shrinkElement = debounce(() => {
      if (actions.in_undo_mode()) return () => {};
      const elt = divRef.current;
      if (elt == null) return;
      const h = elt.offsetHeight + EXTRA_HEIGHT;
      if (h < MIN_HEIGHT) {
        // too small -- do not change
        return;
      }
      actions.setElement({
        obj: { id: element.id, h },
        commit: false,
      });
    }, 250);
    return () => {
      if (actions.in_undo_mode()) return () => {};
      const elt = divRef.current;
      if (elt == null) return;
      const newHeight = elt.offsetHeight + EXTRA_HEIGHT;
      if (newHeight < MIN_HEIGHT) {
        // too small -- do not change
        return;
      }
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
  }, [element.id]);

  useEffect(() => {
    resizeIfNecessary();
  }, [resize, resizeIfNecessary]);

  return (
    <div style={{ ...getStyle(element), height: "100%" }}>
      <div ref={divRef}>
        {!hideInput && <InputPrompt element={element} />}
        {renderInput()}
        {!hideOutput && element.data?.output && (
          <Output element={element} onClick={() => setEditFocus(true)} />
        )}
        {focused && <ControlBar element={element} />}
      </div>
    </div>
  );
}
