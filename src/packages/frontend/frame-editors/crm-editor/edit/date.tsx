import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { Alert, Button, DatePicker } from "antd";
import { useEditableContext } from "./context";
import { TimeAgo } from "@cocalc/frontend/components";
import dayjs from "dayjs";
import { fieldToLabel } from "../util";

export function EditableDate({
  defaultValue,
  id,
  field,
  showTime,
}: {
  defaultValue?: Date;
  id: number;
  field: string;
  showTime?;
}) {
  const [value, setValue] = useState<dayjs.Dayjs | undefined | null>(
    defaultValue ? dayjs(defaultValue) : undefined
  );
  const [edit, setEdit] = useState<boolean>(false);
  const context = useEditableContext();
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setValue(defaultValue ? dayjs(defaultValue) : undefined);
  }, [context.counter]);

  async function save() {
    if (value == null) {
      // todo -- this is probably wrong. Need way to remove due date.
      setError("");
      setEdit(false);
      return;
    }
    const query = {
      [context.table]: {
        id,
        [field]: value.toDate(),
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
        <DatePicker
          value={value}
          disabled={saving}
          showTime={showTime}
          onChange={(date) => {
            setValue(date);
          }}
          onOk={save}
          onBlur={save}
          placeholder={fieldToLabel(field)}
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
        title={`Click to edit ${fieldToLabel(field)}`}
        style={{
          display: "inline-block",
          cursor: "pointer",
          ...(!value
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
        {value && <TimeAgo date={value?.toDate()} />}
      </div>
    );
  }
}
