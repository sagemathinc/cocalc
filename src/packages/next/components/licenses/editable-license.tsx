import { Alert, Input } from "antd";
import { useEffect, useState } from "react";
import apiPost from "lib/api/post";
import { capitalize } from "@cocalc/util/misc";

export function EditableTitle({
  license_id,
  title,
  onChange,
}: {
  license_id: string;
  title: string;
  onChange?: () => void;
}) {
  return (
    <EditableTextField
      license_id={license_id}
      field="title"
      value={title}
      onChange={onChange}
    />
  );
}

export function EditableDescription({
  license_id,
  description,
  onChange,
}: {
  license_id: string;
  description: string;
  onChange?: () => void;
}) {
  return (
    <EditableTextField
      license_id={license_id}
      field="description"
      value={description}
      rows={3}
      onChange={onChange}
    />
  );
}

function EditableTextField({
  license_id,
  field,
  value,
  rows,
  onChange,
}: {
  license_id: string;
  field: "title" | "description";
  value?: string;
  rows?: number;
  onChange?: () => void;
}) {
  const [edit, setEdit] = useState<boolean>(false);
  const [value2, setValue] = useState<string>(value ?? "");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setValue(value ?? "");
    setEdit(false);
    setError("");
  }, [value]);

  async function save(value: string): Promise<void> {
    setEdit(false);
    setError("");
    const query = { manager_site_licenses: { id: license_id, [field]: value } };
    try {
      await apiPost("/user-query", { query });
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ cursor: "pointer" }} onClick={() => setEdit(true)}>
      {error && (
        <Alert type="error" message={`Error saving ${field} - ${error}`} />
      )}
      {capitalize(field)}:{" "}
      {edit &&
        (rows ? (
          <Input.TextArea
            autoFocus
            value={value2}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => save(value2)}
            rows={rows}
          />
        ) : (
          <Input
            autoFocus
            value={value2}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => save(value2)}
            onPressEnter={() => save(value2)}
          />
        ))}
      {!edit && <>{value2.trim() ? value2 : `(set ${field}...)`}</>}
    </div>
  );
}
