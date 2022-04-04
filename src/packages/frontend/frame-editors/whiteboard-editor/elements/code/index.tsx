import { useCallback, useEffect, useRef, useState } from "react";
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
    if (focused || cursors != null) {
      return (
        <div className="nodrag">
          <Input
            cursors={cursors}
            isFocused={focused && editFocus}
            element={element}
            focused={focused}
            canvasScale={canvasScale}
            onBlur={() => setEditFocus(false)}
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
  const resizeIfNecessary = useCallback(() => {
    if (actions.in_undo_mode()) return;
    const elt = divRef.current;
    if (elt == null) return;
    actions.setElement({
      obj: { id: element.id, h: elt.offsetHeight + 30 },
      commit: false,
    });
  }, [element]);
  useEffect(() => {
    resizeIfNecessary();
  }, [resize]);

  return (
    <div style={{ ...getStyle(element), height: "100%" }}>
      <div ref={divRef}>
        {!hideInput && <InputPrompt element={element} />}
        {renderInput()}
        {!hideOutput && element.data?.output && <Output element={element} />}
        {focused && <ControlBar element={element} />}
      </div>
    </div>
  );
}
