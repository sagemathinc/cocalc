import { useEffect, useRef, useState } from "react";
import { Input, Tooltip } from "antd";
import { useEditableContext } from "./context";
import { render } from "./register";

render({ type: "text" }, ({ field, obj }) => <>{obj[field]}</>);

render({ type: "text", ellipsis: true }, ({ field, obj }) => (
  <Tooltip title={obj[field]} placement="left">
    {obj[field]}
  </Tooltip>
));

render({ type: "text", editable: true }, ({ field, obj }) => {
  const [value, setValue] = useState<string>(obj[field]);
  const ref = useRef<any>();
  const { save, saving, counter, edit, error, ClickToEdit } =
    useEditableContext<string>(field);

  useEffect(() => {
    setValue(obj[field]);
  }, [counter]);

  if (edit) {
    return (
      <>
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 5 }}
          disabled={saving}
          ref={ref}
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onBlur={() => save(obj, ref.current.value)}
          onPressEnter={() => save(obj, ref.current.value)}
        />
        {error}
      </>
    );
  } else {
    return <ClickToEdit empty={!value?.trim()}>{value}</ClickToEdit>;
  }
});
