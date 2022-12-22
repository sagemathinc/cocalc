import { render } from "./register";
import { Icon, IconName } from "@cocalc/frontend/components";
import { useEffect, useRef, useState } from "react";
import { useEditableContext } from "./context";
import IconSelect from "@cocalc/frontend/components/icon-select";
import { Popover } from "antd";

render({ type: "icon", editable: false }, ({ field, obj }) => {
  const name = obj[field];
  return name ? <Icon name={name} /> : null;
});

render({ type: "icon", editable: true }, ({ field, obj, spec }) => {
  if (spec.type != "icon" || !spec.editable) {
    throw Error("bug");
  }
  const [name, setName] = useState<string>(obj[field]);
  const { save, saving, counter, error, edit, setEdit } =
    useEditableContext<string>(field);
  const searchRef = useRef<string>(name);

  useEffect(() => {
    setName(obj[field]);
  }, [counter, obj[field]]);

  return (
    <span>
      <Popover
        open={edit}
        onOpenChange={(edit) => {
          if (edit) {
            searchRef.current = name;
          } else {
            if (!searchRef.current) {
              save(obj, null);
            }
          }
          setEdit(edit);
        }}
        trigger="click"
        title={<div style={{ textAlign: "center" }}>Select Icon</div>}
        content={() => {
          return (
            <IconSelect
              defaultSearch={name}
              disabled={saving}
              onChange={(search) => {
                searchRef.current = search;
              }}
              onSelect={(name) => {
                setName(name);
                save(obj, name);
              }}
              fontSize="9pt"
              style={{
                fontSize: "20pt",
                maxWidth: "420px",
                maxHeight: "60vh",
                overflowY: "scroll",
              }}
            />
          );
        }}
      >
        {name ? (
          <Icon style={{ fontSize: "24pt" }} name={name as IconName} />
        ) : (
          <span style={{ color: "#999", cursor: "pointer" }}>Icon...</span>
        )}
      </Popover>
      {error}
    </span>
  );
});
