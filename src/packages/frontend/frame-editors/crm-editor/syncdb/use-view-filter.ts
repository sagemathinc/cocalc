/* Filter for a specific view, sync'd using syncdb. */

import useViewParam from "./use-view-param";

export default function useViewFilter({
  id,
}: {
  id: string; // id of a view of a given db table.
}): [filter: string, setFilter: (string) => void] {
  return useViewParam<string>({ id, name: "filter", defaultValue: "" });
}
