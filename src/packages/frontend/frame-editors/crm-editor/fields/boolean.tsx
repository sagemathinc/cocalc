import { cmp } from "@cocalc/util/cmp";
import { Checkbox } from "antd";
import { render, sorter } from "./register";
import { useEffect, useState } from "react";
import { useEditableContext } from "./context";

sorter({ type: "boolean" }, (a, b) => cmp(!!a, !!b));

render({ type: "boolean", editable: false }, ({ field, obj }) => (
  <Checkbox disabled checked={!!obj[field]} />
));

render({ type: "boolean", editable: true }, ({ field, obj, spec }) => {
  if (spec.type != "boolean" || !spec.editable) {
    throw Error("bug");
  }
  const [value, setValue] = useState<boolean>(!!obj[field]);
  const { save, saving, counter, error } = useEditableContext<boolean>(field);

  useEffect(() => {
    setValue(!!obj[field]);
  }, [counter, obj[field]]);

  return (
    <>
      <Checkbox
        disabled={saving}
        checked={value}
        onChange={(e) => {
          setValue(e.target.checked);
          save(
            obj,
            e.target.checked,
            spec.whenField // set this field to timestamp or clear it.
              ? { [spec.whenField]: e.target.checked ? "NOW()" : null }
              : undefined
          );
        }}
      />
      {error}
    </>
  );
});
