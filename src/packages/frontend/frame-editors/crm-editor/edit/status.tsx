import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { Alert, Button, InputNumber, Progress } from "antd";
import { useEditableContext } from "./context";

export function EditableStatus({
  defaultValue = 0,
  id,
  field,
  steps = 5,
}: {
  defaultValue?: number;
  id: number;
  field: string;
  steps?: number;
}) {
  const [value, setValue] = useState<number>(defaultValue);
  const [edit, setEdit] = useState<boolean>(false);
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
        [field]: value,
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

  // status options for progress bar are:
  //   'success' 'exception' 'normal' 'active'
  // Could base this on last_edited and actual status field
  const percent = parseInt(value ? `${value}` : "0");
  let status: "normal" | "success" | "active" | "exception" = "normal";
  if (percent >= 100) {
    status = "success";
  } else if (percent >= 50) {
    status = "active";
  } else if (percent >= 20) {
    status = "normal";
  }
  const bar = (
    <div
      title={`Click to edit ${field}`}
      style={{ cursor: "pointer" }}
      onClick={() => setEdit(true)}
    >
      <Progress
        percent={percent}
        status={status}
        steps={steps}
        strokeColor={status == "success" ? "#52c41a" : undefined}
      />
    </div>
  );
  if (edit) {
    /* as any in parser below due to antd typing bug? */
    return (
      <>
        {bar}
        <InputNumber
          autoFocus
          disabled={saving}
          value={value ?? 0}
          min={0}
          step={steps ? 100 / steps : 1}
          max={100}
          formatter={(value) => `${value}%`}
          parser={((value) => value!.replace("%", "")) as any}
          onChange={setValue as any}
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
    return bar;
  }
}
