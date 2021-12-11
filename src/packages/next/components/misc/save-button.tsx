import { CSSProperties, useState } from "react";
import { cloneDeep, isEqual } from "lodash";
import { Alert, Button, Space } from "antd";
import useIsMounted from "lib/hooks/mounted";
import Loading from "components/share/loading";
import api from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  edited: any;
  original: any;
  setOriginal: Function;
  table?: string;
  style?: CSSProperties;
  onSave?: (object) => Promise<void> | void; // if onSave is async then awaits and if there is an error shows that; if not, updates state to what was saved.
  isValid?: (object) => boolean; // if given, only allow saving if edited != original and isValid(edited) is true.
}

export default function SaveButton({
  edited,
  original,
  setOriginal,
  table,
  style,
  onSave,
  isValid,
}: Props) {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const isMounted = useIsMounted();

  async function save(table, edited) {
    const e: any = {};
    for (const field in edited) {
      if (!isEqual(original[field], edited[field])) {
        e[field] = cloneDeep(edited[field]);
      }
    }
    const query = { [table]: e };
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
        disabled={saving || same || (isValid != null && !isValid(edited))}
        onClick={async () => {
          if (table) {
            await save(table, edited);
            await onSave?.(edited);
            return;
          }
          try {
            await onSave?.(edited);
            setOriginal(edited);
            setError("");
          } catch (err) {
            setError(err.toString());
          }
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
