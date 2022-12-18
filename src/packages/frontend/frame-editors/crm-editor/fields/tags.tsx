import { render } from "./register";
import { Popconfirm, Tag } from "antd";
import sha1 from "sha1";
import { useEditableContext } from "./context";
import { Icon } from "@cocalc/frontend/components";
import { useEffect, useState } from "react";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

render({ type: "tags", editable: false }, ({ field, obj }) => {
  const tags = obj[field];
  if (tags == null) return null;
  return (
    <div style={{ lineHeight: "2em", display: "inline-block" }}>
      {tags.map((name) => {
        const color = nameToColor(name);
        return (
          <Tag color={color} style={{ color: avatar_fontcolor(color) }}>
            {name}
          </Tag>
        );
      })}
    </div>
  );
});

// color is a function of the name for now, but we will likely make
// it customizable via a global editable table mapping from tag name to color,
// and then this is a lookup into that table instead.
function nameToColor(name: string): string {
  return `#${sha1(name).slice(0, 6)}`;
}

render({ type: "tags", editable: true }, ({ field, obj }) => {
  const { save, counter, error } = useEditableContext<string[]>(field);
  const [tags, setTags] = useState<null | string[]>(obj[field]);
  useEffect(() => {
    setTags(obj[field]);
  }, [counter]);

  return (
    <div style={{ lineHeight: "2em", display: "inline-block" }}>
      {tags?.map((name) => {
        const color = nameToColor(name);
        const style = { color: avatar_fontcolor(color) };
        return (
          <Tag
            color={color}
            style={style}
            closable
            onClose={(e) => e.preventDefault()}
            closeIcon={
              <Popconfirm
                title={
                  <>
                    Remove the{" "}
                    <Tag color={color} style={style}>
                      {name}
                    </Tag>
                    tag?
                  </>
                }
                onConfirm={async () => {
                  console.log("confirmed!");
                  const newTags = tags.filter((tag) => tag != name);
                  setTags(newTags);
                  try {
                    await save(obj, newTags);
                  } catch (_) {
                    // failed -- revert the change at the UI level.
                    setTags(obj[field]);
                  }
                }}
                okText="Yes"
                cancelText="No"
              >
                <Icon style={style} name="times" />
              </Popconfirm>
            }
          >
            {name}
          </Tag>
        );
      })}
      {error}
    </div>
  );
});
