import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { cloneDeep, debounce, isEqual } from "lodash";
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
  onSave?: Function; // if onSave is async then awaits and if there is an error shows that; if not, updates state to what was saved.
  isValid?: (object) => boolean; // if given, only allow saving if edited != original and isValid(edited) is true.
  debounce_ms?: number; // default is DEBOUNCE_MS
}

const DEBOUNCE_MS = 1500;

export default function SaveButton({
  edited,
  original,
  setOriginal,
  table,
  style,
  onSave,
  isValid,
  debounce_ms,
}: Props) {
  if (debounce_ms == null) debounce_ms = DEBOUNCE_MS;
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Tricky hooks: We have to store the state in a ref as well so that
  // we can use it in the save function, since that function
  // is memoized and called from a debounced function.
  const saveRef = useRef<any>({ edited, original, table });
  saveRef.current = { edited, original, table };

  const isMounted = useIsMounted();

  const save = useMemo(() => {
    return async () => {
      const { edited, original, table } = saveRef.current;

      let changes: boolean = false;
      const e: any = {};
      for (const field in edited) {
        if (!isEqual(original[field], edited[field])) {
          e[field] = cloneDeep(edited[field]);
          changes = true;
        }
      }
      if (!changes) {
        // no changes to save.
        return;
      }
      const query = { [table]: e };
      if (isMounted.current) {
        setSaving(true);
        setError("");
      }
      let result;
      try {
        // Note -- we definitely do want to do the save
        // itself, even if the component is already unmounted,
        // so we don't loose changes.
        result = await api("/user-query", { query });
      } catch (err) {
        if (!isMounted.current) return;
        setError(err.message);
        return { error };
      } finally {
        if (isMounted.current) {
          setSaving(false);
        }
      }
      if (!isMounted.current) return;
      if (result.error) {
        setError(result.error);
      } else {
        setOriginal(cloneDeep(edited));
      }
    };
  }, []);

  async function doSave() {
    const e = cloneDeep(saveRef.current.edited);
    if (table) {
      await save();
      if (!isMounted.current) return;
      await onSave?.(e);
      return;
    }
    try {
      await onSave?.(e);
      if (!isMounted.current) return;
      setOriginal(e);
      setError("");
    } catch (err) {
      setError(err.toString());
    }
  }

  const doSaveDebounced = useMemo(
    () => debounce(doSave, debounce_ms),
    [onSave]
  );

  useEffect(() => {
    doSaveDebounced();
    return doSaveDebounced;
  }, [edited]);

  const same = isEqual(edited, original);
  const disabled = saving || same || (isValid != null && !isValid(edited));
  return (
    <div style={style}>
      <Button type="primary" disabled={disabled} onClick={doSave}>
        <Space>
          <Icon name={"save"} />
          {saving ? (
            <Loading delay={250} before="Save">
              Saving...
            </Loading>
          ) : (
            "Save"
          )}
        </Space>
      </Button>
      {!same && error && (
        <Alert type="error" message={error} style={{ marginTop: "15px" }} />
      )}
    </div>
  );
}
