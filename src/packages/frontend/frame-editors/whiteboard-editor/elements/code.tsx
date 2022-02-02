import { useEffect, useState } from "react";
import { Input } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "../actions";
import { Element } from "../types";
import { Markdown } from "@cocalc/frontend/components";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function Code({ element, focused }: Props) {
  const [value, setValue] = useState<string>(element.str ?? "");
  const frame = useFrameContext();

  if (!focused) {
    const val =
      "```py\n" + (element.str?.trim() ? element.str : "Type code") + "\n```";
    return (
      <Markdown
        value={val}
        style={{
          width: "100%",
          height: "100%",
          color: element.data?.color,
          fontSize: element.data?.fontSize,
        }}
      />
    );
  }

  useEffect(() => {
    // should be a 3-way merge...
    setValue(element.str ?? "");
  }, [element.str]);

  return (
    <Input.TextArea
      className="nodrag"
      placeholder="Type code"
      autoFocus
      value={value}
      rows={4}
      onChange={(e) => {
        // TODO: need to also save changes (like with onBlur below), but debounced.
        setValue(e.target.value);
      }}
      onBlur={() => {
        const actions = frame.actions as Actions;
        actions.setElement({ id: element.id, str: value });
      }}
    />
  );
}
