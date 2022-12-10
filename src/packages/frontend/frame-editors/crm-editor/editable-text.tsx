import { webapp_client } from "@cocalc/frontend/webapp-client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Input } from "antd";

export const EditableContext = createContext<any>(null);

export function EditableText({
  defaultValue = "",
  id,
  field,
}: {
  defaultValue?: string;
  id: number;
  field: string;
}) {
  const [value, setValue] = useState<string>(defaultValue);
  const [edit, setEdit] = useState<boolean>(false);
  const ref = useRef<any>();
  const context = useContext(EditableContext);

  useEffect(() => {
    setValue(defaultValue);
  }, [context.counter]);

  async function save() {
    setEdit(false);
    const query = {
      [context.table]: {
        id,
        [field]: ref.current.input.value,
        last_edited: new Date(),
      },
    };
    await webapp_client.query_client.query({ query });
  }

  if (edit) {
    return (
      <Input
        ref={ref}
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onBlur={save}
        onPressEnter={save}
      />
    );
  } else {
    return (
      <div
        title="Click to edit"
        style={{ minWidth: "5em", minHeight: "2em", cursor: "text" }}
        onClick={() => setEdit(true)}
      >
        {value}
      </div>
    );
  }
}
