import { CSSProperties, useState } from "react";
import { isEqual } from "lodash";
import { Alert, Button, Space } from "antd";
import useIsMounted from "lib/hooks/mounted";
import Loading from "components/share/loading";
import api from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  edited: object;
  defaultOriginal: object;
  table: string;
  style?: CSSProperties;
  onSave?: (object) => void;
}

export default function SaveButton({
  edited,
  defaultOriginal,
  table,
  style,
  onSave,
}: Props) {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [original, setOriginal] = useState<object>(defaultOriginal);
  const isMounted = useIsMounted();

  async function save(table, edited) {
    const query = { [table]: removeNulls(edited) };
    setSaving(true);
    setError("");
    let result;
    try {
      result = await api("/user-query", { query });
    } catch (err) {
      if (!isMounted.current) return;
      setError(err.message);
      return { error };
    } finally {
      if (isMounted.current) setSaving(false);
    }
    if (!isMounted.current) return;
    if (result.error) {
      setError(result.error);
    } else {
      setOriginal(edited);
    }
  }

  const same = isEqual(edited, original);

  return (
    <>
      <Button
        style={style}
        type="primary"
        disabled={saving || same}
        onClick={() => {
          if (table) {
            save(table, edited);
          }
          onSave?.(edited);
        }}
      >
        <Space>
          <Icon name={same ? "check" : "save"} />
          {saving ? <Loading delay={0}>Saving...</Loading> : "Save"}
        </Space>
      </Button>
      {!same && error && (
        <Alert type="error" message={error} style={{ marginTop: "15px" }} />
      )}
    </>
  );
}

function removeNulls(obj) {
  const obj2: any = {};
  for (const field in obj) {
    if (obj[field] != null) {
      obj2[field] = obj[field];
    }
  }
  return obj2;
}
