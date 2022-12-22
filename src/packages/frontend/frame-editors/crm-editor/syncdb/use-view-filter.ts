/* Filter for a specific view, syncd using syncdb. */

import { useCallback, useEffect, useState } from "react";
import { useSyncdbContext } from "./context";
import { debounce } from "lodash";

const TABLE = "view-filters";

export interface ViewFilter {
  table: "view-filters";
  id: string;
  filter: string;
}

export default function useViewFilter({
  id,
}: {
  id: string; // id of a view if the given dbtable.
}): [filter: string, setFilter: (string) => void] {
  const { syncdb } = useSyncdbContext();

  const [filter, setFilter0] = useState<string>(
    syncdb?.get_one({ table: TABLE, id })?.get("filter") ?? ""
  );

  const save = useCallback(
    debounce((filter) => {
      if (syncdb != null) {
        syncdb.set({ id, table: TABLE, filter });
        syncdb.commit();
      }
    }, 1000),
    [syncdb, id]
  );

  const setFilter = useCallback(
    (filter: string) => {
      setFilter0(filter);
      save(filter);
    },
    [setFilter0, syncdb, save, id]
  );

  useEffect(() => {
    if (syncdb == null) {
      setFilter("");
      return;
    }
    const update = () => {
      setFilter0(syncdb.get_one({ table: TABLE, id })?.get("filter") ?? "");
    };
    update();
    const handleChange = (keys) => {
      for (const key of keys) {
        if (key.get("table") == TABLE && key.get("id") == id) {
          update();
          return;
        }
      }
    };

    syncdb.on("change", handleChange);

    return () => {
      syncdb.removeListener("change", handleChange);
    };
  }, [syncdb, id]);

  return [filter, setFilter];
}
