import { useEffect, useRef, useState } from "react";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { useEditableContext } from "./context";
import { register } from "./register";

register({ type: "markdown", editable: false }, ({ field, obj }) => (
  <StaticMarkdown value={obj[field] ?? ""} />
));

register({ type: "markdown", editable: true }, ({ field, obj }) => {
  const [value, setValue] = useState<string>(obj[field] ?? "");
  const { save, counter, edit, error, ClickToEdit } =
    useEditableContext<string>(field);
  const valueRef = useRef<any>();

  useEffect(() => {
    // TODO: at least a little 3-way merge when upstream value changes?
    setValue(obj[field] ?? "");
  }, [counter]);

  return edit ? (
    <div>
      <MultiMarkdownInput
        getValueRef={valueRef}
        autoFocus
        value={value}
        onChange={setValue}
        onBlur={() => save(obj, valueRef.current())}
        onShiftEnter={() => save(obj, valueRef.current())}
      />
      {error}
    </div>
  ) : (
    <ClickToEdit empty={!value.trim()}>
      <StaticMarkdown value={value} />
    </ClickToEdit>
  );
});
