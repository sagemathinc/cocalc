import { render } from "./register";
import { /*Button, */ Popconfirm, Select, Space, Tag } from "antd";
import sha1 from "sha1";
import { useEditableContext } from "./context";
import { Icon } from "@cocalc/frontend/components";
import { useEffect, useState } from "react";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { MAX_TAG_LENGTH } from "@cocalc/util/db-schema";

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

  //const [adding, setAdding] = useState<boolean>((tags?.length ?? 0) == 0);
  const adding = true;

  useEffect(() => {
    setTags(obj[field]);
  }, [counter]);

  return (
    <Space direction="vertical">
      {tags != null && tags.length > 0 && (
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
          {/*!adding && (
            <Button
              size="small"
              style={{ color: "#c6c6c6" }}
              onClick={() => setAdding(true)}
            >
              <Icon name="plus-circle" /> Add
            </Button>
          )*/}
        </div>
      )}
      {error}
      {adding && (
        <AddTags
          onBlur={async (addedTags: string[]) => {
            if (addedTags.length == 0) {
              //setAdding(false);
              return;
            }
            // combine together, eliminate duplicates, truncate too long tags
            // TODO: We do not sort, since we plan to make tags drag-n-drop sortable
            // by the client here...
            const newTags = Array.from(
              new Set((tags ?? []).concat(addedTags))
            ).map((tag) => tag.slice(0, MAX_TAG_LENGTH));
            setTags(newTags);
            try {
              await save(obj, newTags);
              //setAdding(false);
            } catch (_) {
              // failed -- revert the change at the UI level.
              setTags(obj[field]);
            }
          }}
        />
      )}
    </Space>
  );
});

function AddTags({ onBlur }) {
  const [value, setValue] = useState<any>([]);

  return (
    <Select
      autoFocus
      size="small"
      value={value}
      maxTagTextLength={30 /* doesn't by-hand input size though */}
      mode="tags"
      style={{ width: "100%", minWidth: "12ex" }}
      placeholder="Add tags..."
      onBlur={() => {
        onBlur(value);
        setValue([]);
      }}
      onChange={setValue}
      tagRender={({ value: name }) => {
        const color = nameToColor(name);
        return (
          <Tag color={color} style={{ color: avatar_fontcolor(color) }}>
            {name}
          </Tag>
        );
      }}
    />
  );
}
