import { useEffect, useState } from "react";
import { useFrameContext } from "../hooks";
import { Element } from "../types";
import { DEFAULT_FONT_SIZE } from "../tools/defaults";

import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
// This import ensures that math rendering is loaded.
import "@cocalc/frontend/editors/slate/elements/math/math-widget";
import { EditableMarkdown } from "@cocalc/frontend/editors/slate/editable-markdown";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
}

export default function Text({ element, focused, canvasScale }: Props) {
  const [value, setValue] = useState<string>(element.str ?? "");
  const [editFocus, setEditFocus] = useState<boolean>(false);
  const { actions } = useFrameContext();
  useEffect(() => {
    // should really be a 3-way merge...
    setValue(element.str ?? "");
  }, [element.str]);
  useEffect(() => {
    return () => {
      // unmounting, so save
      console.log("unmounting, so need to save if editing...");
      //actions.setElement({ id: element.id, str: value });
    };
  }, []);

  const style = getStyle(element);

  if (!focused) {
    return (
      <StaticMarkdown
        value={element.str?.trim() ? element.str : "Type text"}
        style={style}
      />
    );
  }

  return (
    <div
      style={{ ...style, height: "100%" }}
      className={editFocus ? "nodrag" : undefined}
    >
      <EditableMarkdown
        onFocus={() => setEditFocus(true)}
        onBlur={() => setEditFocus(false)}
        value={value}
        is_current={true}
        hidePath
        disableWindowing
        font_size={element.data?.fontSize ?? DEFAULT_FONT_SIZE}
        style={{ background: undefined, backgroundColor: undefined }}
        pageStyle={{ background: undefined, padding: 0 }}
        editBarStyle={{
          top: `${-35 - 5 / canvasScale}px`,
          left: "5px",
          position: "absolute",
          border: "1px solid #ccc",
          borderRadius: "3px",
          boxShadow: "1px 3px 5px #ccc",
          margin: "5px",
          minWidth: "500px",
          background: "white",
          transform: `scale(${1 / canvasScale})`,
          transformOrigin: "bottom left",
          fontFamily: "sans-serif",
          fontSize: "14px",
        }}
        actions={{
          set_value: (str) => {
            actions.setElement({ id: element.id, str });
          },
        }}
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
