/* Filter for a specific view, syncd using syncdb. */

import useRecord from "./use-record";
import { useCallback } from "react";

export default function useViewFilter({
  id,
}: {
  id: string; // id of a view if the given dbtable.
}): [filter: string, setFilter: (string) => void] {
  const [record, setRecord] = useRecord<{
    filter?: string;
  }>({
    id,
    table: "view-filters",
    defaultValue: { filter: "" },
  });
  const setFilter = useCallback(
    (filter: string) => setRecord({ filter }),
    [setRecord]
  );

  return [record.filter ?? "", setFilter];
}
