/*
Array of strings that are meant to be interpreted as tags.
This is much less complicated than the normal tags that map
to integers in the CRM. These are used at least for
accounts for users to indicate their interests.
*/
import { Input, Tag } from "antd";
import { render } from "./register";
import { useEffect, useRef, useState } from "react";
import { useEditableContext } from "./context";

render({ type: "string-tags", editable: false }, ({ field, obj }) => {
  const tags = obj[field];
  if (tags == null) return null;
  return (
    <div style={{ lineHeight: "2em", display: "inline-block" }}>
      {tags.map((value) => (
        <Tag key={value}>{value}</Tag>
      ))}
    </div>
  );
});

render({ type: "string-tags", editable: true }, ({ field, obj, spec }) => {
  const ref = useRef<any>(undefined);
  const { save, saving, counter, edit, error, ClickToEdit } =
    useEditableContext<string>(field);
  const [value, setValue] = useState<string>(obj[field]?.join(",") ?? "");
  useEffect(() => {
    setValue(obj[field]);
  }, [counter, obj[field]]);

  if (spec.type != "string-tags" || !spec.editable) {
    throw Error("bug");
  }
  if (!edit) {
    const tags = obj[field];
    return (
      <ClickToEdit empty={!tags || tags.length == 0}>
        <div style={{ lineHeight: "2em", display: "inline-block" }}>
          {tags?.map((value) => (
            <Tag key={value}>{value}</Tag>
          ))}
        </div>
      </ClickToEdit>
    );
  }
  return (
    <>
      <Input
        style={{ width: "100%" }}
        disabled={saving}
        ref={ref}
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onBlur={() => {
          setValue(ref.current.input.value);
          save(obj, ref.current.input.value.split(","));
        }}
        onPressEnter={() => {
          setValue(ref.current.input.value);
          save(obj, ref.current.input.value.split(","));
        }}
      />
      {error}
    </>
  );
});
