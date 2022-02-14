import { useEffect, useState } from "react";
import { useFrameContext } from "../hooks";
import { Element } from "../types";
import { DEFAULT_FONT_SIZE } from "../tools/defaults";

import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
// This import ensures that math rendering is loaded.
// import "@cocalc/frontend/editors/slate/elements/math/math-widget";
// import { EditableMarkdown } from "@cocalc/frontend/editors/slate/editable-markdown";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
  readOnly?: boolean;
  noteMode?: boolean; // used for sticky note
}

const PADDING = "10px";

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

  const style = { ...getStyle(element), padding: PADDING };

  if (readOnly || !focused || element.locked) {
    return (
      <StaticMarkdown
        value={element.str?.trim() ? element.str : "Type text"}
        style={style}
      />
    );
  }

  return (
    <div
      style={{ ...style, height: "100%", padding: PADDING }}
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

export function getStyle(
  element,
  defaults?: {
    color?: string;
    fontSize?: number;
    fontFamily?: string;
    background?: string;
  }
) {
  return {
    color: element.data?.color ?? defaults?.color,
    fontSize: element.data?.fontSize ?? defaults?.fontSize,
    fontFamily: element.data?.fontFamily ?? defaults?.fontFamily,
    background: element.data?.background ?? defaults?.background,
  };
}
