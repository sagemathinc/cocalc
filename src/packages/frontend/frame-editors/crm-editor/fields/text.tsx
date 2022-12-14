import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Tooltip } from "antd";
import { useEditableContext } from "./context";
import { fieldToLabel } from "../util";
import { register } from "./register";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

register({ type: "text" }, ({ field, obj }) => <>{obj[field]}</>);

register({ type: "text", ellipsis: true }, ({ field, obj }) => (
  <Tooltip title={obj[field]} placement="left">
    {obj[field]}
  </Tooltip>
));

register({ type: "text", markdown: true }, ({ field, obj }) => (
  <StaticMarkdown value={obj[field] ?? ""} />
));

register({ type: "text", editable: true }, ({ field, obj }) => {
  const [value, setValue] = useState<string>(obj[field]);
  const ref = useRef<any>();
  const { save, saving, counter, edit, setEdit, error } = useEditableContext();

  useEffect(() => {
    setValue(obj[field]);
  }, [counter]);

  const doSave = useMemo(() => {
    return () => save(obj, { [field]: ref.current.input.value });
  }, [obj, field]);

  if (edit) {
    return (
      <>
        <Input
          disabled={saving}
          ref={ref}
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onBlur={doSave}
          onPressEnter={doSave}
        />
        {error}
      </>
    );
  } else {
    const empty = !value?.trim();
    return (
      <div
        title={`Click to edit ${fieldToLabel(field)}`}
        style={{
          display: "inline-block",
          cursor: "pointer",
          ...(empty
            ? {
                minWidth: "5em",
                padding: "5px",
                minHeight: "1.5em",
                border: "1px solid #eee",
                borderRadius: "3px",
              }
            : undefined),
        }}
        onClick={() => setEdit(true)}
      >
        {empty ? (
          <span style={{ color: "#aaa" }}>{fieldToLabel(field)}...</span>
        ) : (
          value
        )}
      </div>
    );
  }
});
