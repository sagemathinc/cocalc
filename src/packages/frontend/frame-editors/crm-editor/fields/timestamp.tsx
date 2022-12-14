import { useEffect, useState } from "react";
import { Alert, Button, DatePicker } from "antd";
import { useEditableContext } from "../edit/context";
import { TimeAgo } from "@cocalc/frontend/components";
import dayjs from "dayjs";
import { fieldToLabel } from "../util";

import { register } from "./register";

register({ type: "timestamp" }, ({ field, obj }) => (
  <TimeAgo date={obj[field]} />
));

register({ type: "timestamp", editable: true }, ({ field, obj }) => {
  const [value, setValue] = useState<dayjs.Dayjs | undefined | null>(
    obj[field] ? dayjs(obj[field]) : undefined
  );
  const [edit, setEdit] = useState<boolean>(false);
  const context = useEditableContext();
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setValue(obj[field] ? dayjs(obj[field]) : undefined);
  }, [context.counter]);

  async function save() {
    if (value == null) {
      // todo -- this is probably wrong. Need way to remove due date.
      setError("");
      setEdit(false);
      return;
    }
    try {
      setError("");
      setSaving(true);
      await context.save(obj, { [field]: value.toDate() });
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
});
