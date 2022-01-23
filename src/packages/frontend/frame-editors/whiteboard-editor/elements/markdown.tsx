import { useEffect, useState } from "react";
import { Markdown as StaticMarkdown } from "@cocalc/frontend/components";
import { Input, Popover } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "../actions";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Markdown({ element, focused }) {
  const [value, setValue] = useState<string>(element.str);
  const frame = useFrameContext();

  if (!focused) {
    return (
      <StaticMarkdown
        value={element.str?.trim() ? element.str : "Type text"}
        style={!element.str?.trim() ? { color: "#aaa" } : undefined}
      />
    );
  }

  useEffect(() => {
    // should really be a 3-way merge...
    setValue(element.str);
  }, [element.str]);

  return (
    <div>
      <Popover
        placement={"left" as "left"}
        title={
          <>
            <Icon name="markdown" style={{ marginRight: "5px" }} /> Text
            (Markdown)
          </>
        }
        content={() => (
          <div style={{ width: "600px", maxWidth: "70vw" }}>
            <Input.TextArea
              autoFocus
              value={value}
              rows={4}
              onChange={(e) => {
                // TODO: need to also save changes (like with onBlur below), but debounced.
                setValue(e.target.value);
              }}
              onBlur={() => {
                const actions = frame.actions as Actions;
                actions.set({ id: element.id, str: value });
                actions.syncstring_commit();
              }}
            />
          </div>
        )}
        trigger="click"
      >
        <StaticMarkdown
          style={!value?.trim() ? { color: "#aaa" } : undefined}
          value={value?.trim() ? value : "Type text"}
        />
      </Popover>
    </div>
  );
}
