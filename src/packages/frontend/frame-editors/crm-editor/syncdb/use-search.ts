/*
Support AND searches with some operators.

Obviously, we should also have OR and parens someday, but maybe that isn't
needed for our CRM project yet, at least.
*/

import useRecord from "./use-record";
import { useCallback, useMemo } from "react";
import { isEqual } from "lodash";
import type { Operator } from "@cocalc/util/db-schema";
export type { Operator };

export interface AtomicSearch {
  field?: string;
  operator?: Operator;
  value?: any;
}

export default function useSearch({
  id,
}: {
  id: string; // id of a view of the given dbtable.
}): [
  search: AtomicSearch[],
  setSearch: (n: number, search: AtomicSearch | null) => void
] {
  const [record, setRecord] = useRecord<{
    search?: AtomicSearch[];
  }>({
    id,
    table: "view-search",
    defaultValue: { search: [] },
  });

  const search = useMemo<AtomicSearch[]>(() => {
    return record.search ?? [];
  }, [record.search]);

  const setSearch = useCallback(
    (n: number, atomicSearch: AtomicSearch | null) => {
      if (atomicSearch == null) {
        // delete
        if (n >= search.length) {
          // nothing to do
          return;
        }
        // delete this entry:
        search.splice(n, 1);
      } else {
        if (isEqual(search[n], atomicSearch)) {
          // no-op
          return;
        }
        // change or set
        search[n] = atomicSearch;
      }
      setRecord({ search: [...search] });
    },
    [setRecord, search]
  );

  return [search, setSearch];
}
