import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input } from "antd";
import { useEditableContext } from "./context";
import { fieldToLabel } from "../util";

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
        last_edited: webapp_client.server_time(),
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
    const empty = !value?.trim();
    return (
      <span
        title={`Click to edit ${field}`}
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
      </span>
    );
  }
}
