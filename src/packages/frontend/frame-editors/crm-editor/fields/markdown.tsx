import { useEffect, useRef, useState } from "react";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useEditableContext } from "./context";
import { render } from "./register";
import { Button, Space } from "antd";

render({ type: "markdown", editable: false }, ({ field, obj }) => (
  <StaticMarkdown value={obj[field] ?? ""} />
));

render({ type: "markdown", editable: true }, ({ field, obj, viewOnly }) => {
  const [value, setValue] = useState<string>(obj[field] ?? "");
  const { save, counter, edit, error, ClickToEdit } =
    useEditableContext<string>(field);
  const valueRef = useRef<any>(undefined);

  useEffect(() => {
    // TODO: at least a little 3-way merge when upstream value changes?
    setValue(obj[field] ?? "");
  }, [counter, obj[field]]);

  // This naive thing doesn't work, of course, since the change triggers
  // updating to upstream.  I've solved this annoying problem a million times
  // TODO: much better solution is to use the crm syncdb to solve this problem!
  //   const periodicallySave = useRef<Function | null>(null);
  //   useEffect(() => {
  //     if (!edit) {
  //       periodicallySave.current = null;
  //       return;
  //     }
  //     let cancel = false;
  //     periodicallySave.current = debounce(() => {
  //       if (!edit || cancel || valueRef.current == null) return;
  //       save(obj, valueRef.current(), undefined, true);
  //     }, 2000);
  //     return () => {
  //       cancel = true;
  //     };
  //   }, [obj, edit]);

  if (viewOnly) {
    if (!value?.trim()) return null;
    return <StaticMarkdown value={value} />;
  }

  return edit ? (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Button type="primary" onClick={() => save(obj, valueRef.current())}>
        Save (shift+enter)
      </Button>
      {error}
      <MultiMarkdownInput
        getValueRef={valueRef}
        autoFocus
        value={value}
        onChange={(value) => {
          setValue(value);
        }}
        onShiftEnter={() => save(obj, valueRef.current())}
        onBlur={() => save(obj, valueRef.current(), undefined, true)}
      />
    </Space>
  ) : (
    <ClickToEdit empty={!value.trim()}>
      <StaticMarkdown value={value} />
    </ClickToEdit>
  );
});
