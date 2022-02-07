import { useEffect, useState } from "react";
import { Input, Popover } from "antd";
import { useFrameContext } from "../hooks";
import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "../types";

import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
// This import ensures that math rendering is loaded.
import "@cocalc/frontend/editors/slate/elements/math/math-widget";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function Text({ element, focused }: Props) {
  const [value, setValue] = useState<string>(element.str ?? "");
  const frame = useFrameContext();
  useEffect(() => {
    // should really be a 3-way merge...
    setValue(element.str ?? "");
  }, [element.str]);

  if (!focused) {
    return (
      <StaticMarkdown
        value={element.str?.trim() ? element.str : "Type text"}
        style={getStyle(element)}
      />
    );
  }

  return (
    <div>
      <Popover
        placement={"left" as "left"}
        title={
          <>
            <Icon name="markdown" style={{ marginRight: "5px" }} /> Text
          </>
        }
        content={() => (
          <div style={{ width: "600px", maxWidth: "70vw" }} className="nodrag">
            <Input.TextArea
              autoFocus
              value={value}
              rows={4}
              onChange={(e) => {
                // TODO: need to also save changes (like with onBlur below), but debounced.
                setValue(e.target.value);
              }}
              onBlur={() => {
                frame.actions.setElement({ id: element.id, str: value });
              }}
            />
          </div>
        )}
        trigger="click"
      >
        <StaticMarkdown
          style={getStyle(element)}
          value={value?.trim() ? value : "Type text"}
        />
      </Popover>
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
