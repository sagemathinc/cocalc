import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Progress } from "antd";
import { useEditableContext } from "./context";

export function EditableStatus({
  defaultValue = 0,
  id,
  field,
  steps,
  strokeColor,
}: {
  defaultValue?: number;
  id: number;
  field: string;
  steps?: number;
  strokeColor?;
}) {
  const [value, setValue] = useState<number | string>(defaultValue);
  const [edit, setEdit] = useState<boolean>(false);
  const ref = useRef<any>();
  const context = useEditableContext();
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setValue(defaultValue);
  }, [context.counter]);

  async function save() {
    const percent = parseInt(
      ref.current.input.value ? ref.current.input.value : "0"
    );
    const query = {
      [context.table]: {
        id,
        [field]: percent,
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
    // status options for progress bar are:
    //   'success' 'exception' 'normal' 'active'
    // Could base this on last_edited and actual status field
    const percent = parseInt(value ? `${value}` : "0");
    let status: "normal" | "success" | "active" | "exception" = "normal";
    if (percent >= 100) {
      status = "success";
    } else if (percent >= 50) {
      status = "active";
    }
    return (
      <div
        title={`Click to edit ${field}`}
        style={{ cursor: "pointer" }}
        onClick={() => setEdit(true)}
      >
        <Progress
          percent={percent}
          status={status}
          steps={steps}
          strokeColor={strokeColor}
        />
      </div>
    );
  }
}
