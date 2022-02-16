import { useEffect, useState } from "react";
import { useFrameContext } from "../hooks";
import { Element } from "../types";
import { DEFAULT_FONT_SIZE } from "../tools/defaults";
import TextStatic, { getStyle, PADDING } from "./text-static";
export { getStyle };

import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
  readOnly?: boolean;
  noteMode?: boolean; // used for sticky note
}

export default function Text({
  element,
  focused,
  readOnly,
  canvasScale,
  noteMode,
}: Props) {
  const [value, setValue] = useState<string>(element.str ?? "");
  const [editFocus, setEditFocus] = useState<boolean>(false);
  const { actions } = useFrameContext();
  useEffect(() => {
    // should really be a 3-way merge...
    setValue(element.str ?? "");
  }, [element.str]);
  useEffect(() => {
    if (readOnly) return;
    return () => {
      // TODO
      // unmounting, so save
      console.log("unmounting, so need to save if editing...");
      //actions.setElement({ id: element.id, str: value });
    };
  }, []);

  if (readOnly || !focused || element.locked) {
    return <TextStatic element={element} />;
  }

  return (
    <div
      style={{ ...getStyle(element), padding: PADDING, height: "100%" }}
      className={editFocus ? "nodrag" : undefined}
    >
      <MultiMarkdownInput
        minimal
        hideHelp
        onFocus={() => setEditFocus(true)}
        onBlur={() => setEditFocus(false)}
        value={value}
        fontSize={element.data?.fontSize ?? DEFAULT_FONT_SIZE}
        onChange={(str) => actions.setElement({ id: element.id, str })}
        editBarStyle={{
          top: noteMode ? "-32px" : `${-55 - 5 / canvasScale}px`,
          left: "5px",
          position: "absolute",
          border: "1px solid #ccc",
          borderRadius: "3px",
          boxShadow: "1px 3px 5px #ccc",
          margin: "5px",
          minWidth: "500px",
          background: "white",
          transform: noteMode
            ? `scale(${Math.min(0.8, 1 / canvasScale)})`
            : `scale(${1 / canvasScale})`,
          transformOrigin: "bottom left",
          fontFamily: "sans-serif",
        }}
        markdownToggleStyle={noteMode ? { right: "-23px" } : undefined}
      />
    </div>
  );
}
