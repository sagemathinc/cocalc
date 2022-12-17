import { useEffect, useRef, useState } from "react";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useEditableContext } from "./context";
import { render } from "./register";
import { Button, Space } from "antd";

render({ type: "markdown", editable: false }, ({ field, obj }) => (
  <StaticMarkdown value={obj[field] ?? ""} />
));

render({ type: "markdown", editable: true }, ({ field, obj }) => {
  const [value, setValue] = useState<string>(obj[field] ?? "");
  const { save, counter, edit, error, ClickToEdit } =
    useEditableContext<string>(field);
  const valueRef = useRef<any>();

  useEffect(() => {
    // TODO: at least a little 3-way merge when upstream value changes?
    setValue(obj[field] ?? "");
  }, [counter]);

  // TODO: edit mode should likely be a popover...
  return edit ? (
    <Space direction="vertical">
      <Button type="primary" onClick={() => save(obj, valueRef.current())}>
        Save
      </Button>
      <MultiMarkdownInput
        getValueRef={valueRef}
        autoFocus
        value={value}
        onChange={setValue}
        onShiftEnter={() => save(obj, valueRef.current())}
      />
      {error}
    </Space>
  ) : (
    <ClickToEdit empty={!value.trim()}>
      <StaticMarkdown value={value} />
    </ClickToEdit>
  );
});
