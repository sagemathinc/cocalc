/*
Hook for getting and setting the ordered list of visible table tabs.

This is determines which tables tabs are visible and in what order they appear.

Internally this is stored in the syncdb, so available and sync'd between
all users of this document from any browser.  It's in the record:

  { table: "tables", id:'tabs', value:['tasks', 'people', ...]}
*/

import { useSyncdbRecord } from "@cocalc/frontend/app-framework/syncdb";
import { useCallback } from "react";
import { getTables } from "../tables";

const PRIMARY_KEY = { id: "tabs", table: "tables" } as const;

export default function useTables(): [
  tables: string[],
  setTables: (value: string[]) => void
] {
  const [record, setRecord] = useSyncdbRecord<{ value: string[] }>({
    key: { id: "tabs", table: "tables" } as any,
    defaultValue: { value: [], ...PRIMARY_KEY },
  });
  const setTables = useCallback(
    (value: string[]) => {
      setRecord({ value, ...PRIMARY_KEY });
    },
    [setRecord]
  );

  return [record.value, setTables];
}
