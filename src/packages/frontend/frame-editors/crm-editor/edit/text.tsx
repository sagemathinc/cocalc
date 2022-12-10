import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input } from "antd";
import { useEditableContext } from "./context";

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
  const context = useEditableContext();
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setValue(defaultValue);
  }, [context.counter]);

  async function save() {
    const query = {
      [context.table]: {
        id,
        [field]: ref.current.input.value,
        last_edited: new Date(),
      },
    };
    try {
      setError("");
      setSaving(true);
      await webapp_client.query_client.query({ query });
      setEdit(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  }

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
          onBlur={save}
          onPressEnter={save}
        />
        {error && (
          <Alert
            type="error"
            message={
              <>
                {error}{" "}
                <Button size="small" onClick={save}>
                  try again
                </Button>
              </>
            }
          />
        )}
      </>
    );
  } else {
    return (
      <div
        title="Click to edit"
        style={{
          minWidth: "5em",
          minHeight: "1.5em",
          cursor: "text",
          border: value?.trim() ? undefined : "1px solid #eee",
          borderRadius: "3px",
        }}
        onClick={() => setEdit(true)}
      >
        {value}
      </div>
    );
  }
}
