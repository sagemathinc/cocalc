import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input } from "antd";
import { useEditableContext } from "../edit/context";
import { fieldToLabel } from "../util";

interface Props {
  field: string;
  obj: object;
}

export default function EditableText({ field, obj }: Props) {
  const [value, setValue] = useState<string>(obj[field]);
  const [edit, setEdit] = useState<boolean>(false);
  const ref = useRef<any>();
  const context = useEditableContext();
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setValue(obj[field]);
  }, [context.counter]);

  async function save() {
    try {
      setError("");
      setSaving(true);
      context.save(obj, { [field]: ref.current.input.value });
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
      <div
        title={`Click to edit ${fieldToLabel(field)}`}
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
      </div>
    );
  }
}
