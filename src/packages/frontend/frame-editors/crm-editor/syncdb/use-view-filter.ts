/* Filter for a specific view, syncd using syncdb. */

import { useSyncdbRecord } from "@cocalc/frontend/app-framework/syncdb";
import { useCallback } from "react";

const TABLE = "view-filters";

export default function useViewFilter({
  id,
}: {
  id: string; // id of a view if the given dbtable.
}): [filter: string, setFilter: (string) => void] {
  const [record, setRecord] = useSyncdbRecord<{
    table: "view-filters";
    id: string;
    filter?: string;
  }>({
    key: { id, table: TABLE },
    defaultValue: { id, table: TABLE, filter: "" },
  });
  const setFilter = useCallback(
    (filter: string) => {
      setRecord({ table: TABLE, id, filter });
    },
    [setRecord]
  );

  return [record.filter ?? "", setFilter];
}
