import { useEffect, useState } from "react";
import { Markdown } from "@cocalc/frontend/components";
import { Input, Popover } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "../actions";
import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "../types";
import { path_split } from "@cocalc/util/misc";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function Text({ element, focused }: Props) {
  const [value, setValue] = useState<string>(element.str ?? "");
  const frame = useFrameContext();

  if (!focused) {
    return (
      <Markdown
        project_id={frame.project_id}
        file_path={path_split(frame.path).head}
        value={element.str?.trim() ? element.str : "Type text"}
        style={{
          color: element.data?.color,
        }}
      />
    );
  }

  useEffect(() => {
    // should really be a 3-way merge...
    setValue(element.str ?? "");
  }, [element.str]);

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
                const actions = frame.actions as Actions;
                actions.setElement({ id: element.id, str: value });
              }}
            />
          </div>
        )}
        trigger="click"
      >
        <Markdown
          project_id={frame.project_id}
          file_path={path_split(frame.path).head}
          style={{
            color: element.data?.color,
          }}
          value={value?.trim() ? value : "Type text"}
        />
      </Popover>
    </div>
  );
}
