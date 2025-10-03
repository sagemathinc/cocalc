import { Alert, Button, Space } from "antd";
import { cloneDeep, debounce, isEqual } from "lodash";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import Loading from "components/share/loading";
import api from "lib/api/post";
import useIsMounted from "lib/hooks/mounted";

import { Icon } from "@cocalc/frontend/components/icon";
import { keys } from "@cocalc/util/misc";
import { SCHEMA } from "@cocalc/util/schema";

interface Props {
  edited: any;
  original: any;
  setOriginal: Function;
  table?: string;
  style?: CSSProperties;
  onSave?: Function; // if onSave is async then awaits and if there is an error shows that; if not, updates state to what was saved.
  isValid?: (object) => boolean; // if given, only allow saving if edited != original and isValid(edited) is true.
  debounce_ms?: number; // default is DEBOUNCE_MS
  disabled?: boolean; // if given, overrides internaal logic.
}

const DEBOUNCE_MS = 1500;

export default function SaveButton({
  disabled,
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
        return false;
      }

      for (const field of preserveFields(table)) {
        e[field] = cloneDeep(edited[field]);
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
        return false;
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
      return true; // successful save
    };
  }, []);

  function doSave() {
    (async () => {
      const e = cloneDeep(saveRef.current.edited);
      if (table) {
        const didSave = await save();
        if (!isMounted.current) return;
        if (didSave) {
          await onSave?.(e);
        }
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
    })();
  }

  const doSaveDebounced = useMemo(
    () => debounce(doSave, debounce_ms),
    [onSave],
  );

  useEffect(() => {
    doSaveDebounced();
    return doSaveDebounced;
  }, [edited]);

  const same = isEqual(edited, original);
  return (
    <div style={style}>
      <Button
        type="primary"
        disabled={
          disabled ?? (saving || same || (isValid != null && !isValid(edited)))
        }
        onClick={doSave}
      >
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

function preserveFields(table: string): string[] {
  return keys(SCHEMA[table].user_query?.set?.required_fields ?? {});
}
