import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { useEditableContext } from "./context";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { Button } from "antd";

export function EditableMarkdown({
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
  const context = useEditableContext();

  useEffect(() => {
    setValue(defaultValue);
  }, [context.counter]);

  async function save(value: string) {
    setValue(value);
    const query = {
      [context.table]: {
        id,
        [field]: value,
        last_edited: webapp_client.server_time(),
      },
    };
    await webapp_client.query_client.query({ query });
  }

  return (
    <div style={{ marginLeft: "30px" }}>
      <Button
        style={{ marginBottom: "5px" }}
        onClick={() => {
          setEdit(!edit);
        }}
      >
        {edit ? "Editing" : "Edit"}
      </Button>
      {edit ? (
        <MultiMarkdownInput
          autoFocus
          value={value}
          onChange={save}
          onShiftEnter={() => setEdit(false)}
        />
      ) : (
        <div
          style={{
            width: "100%",
            minWidth: "5em",
            minHeight: "2em",
            cursor: "text",
            border: "1px solid #ccc",
            borderRadius: "5px",
            padding: "5px 15px",
            background: "white",
          }}
          onDoubleClick={() => setEdit(true)}
        >
          <StaticMarkdown value={value.trim() ? value : "Notes..."} />
        </div>
      )}
    </div>
  );
}
