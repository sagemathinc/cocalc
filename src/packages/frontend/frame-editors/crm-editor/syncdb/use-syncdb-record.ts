/*
Hook that is like useState but for one record of the syncdb
identified by a primary key.

This is pretty generic and has nothing to do with CRM in particular.
It should get factored out.
*/

import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncdbContext } from "./context";
import { debounce, isEqual } from "lodash";

export default function useSyncdbRecord<T>({
  key,
  debounceMs = 1000,
  defaultValue,
}: {
  key: T;
  debounceMs?: number;
  defaultValue: T;
}): [value: T, setValue: (obj: T) => void] {
  const { syncdb } = useSyncdbContext();

  const [value, setValue0] = useState<T>(
    syncdb?.get_one(key)?.toJS() ?? { ...defaultValue, ...key }
  );

  const lastCommitRef = useRef<T>(defaultValue);

  const save = useCallback(
    debounce((value: T) => {
      if (syncdb != null) {
        lastCommitRef.current = { ...value, ...key };
        syncdb.set(lastCommitRef.current);
        syncdb.commit();
      }
    }, debounceMs),
    [syncdb, key]
  );

  const setValue = useCallback(
    (value: T) => {
      setValue0(value);
      save(value);
    },
    [setValue0, save]
  );

  useEffect(() => {
    if (syncdb == null) {
      setValue({ ...defaultValue, ...key });
      return;
    }
    const update = () => {
      const val = syncdb?.get_one(key)?.toJS() ?? { ...defaultValue, ...key };
      if (isEqual(val, lastCommitRef.current)) return;
      setValue0(val);
    };
    const handleChange = (keys) => {
      for (const change of keys) {
        if (isEqual(change.toJS(), key)) {
          update();
          return;
        }
      }
    };

    syncdb.on("change", handleChange);

    return () => {
      syncdb.removeListener("change", handleChange);
    };
  }, [syncdb, key]);

  return [value, setValue];
}
