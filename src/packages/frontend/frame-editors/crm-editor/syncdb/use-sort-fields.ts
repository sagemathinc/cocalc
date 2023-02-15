import useRecord from "./use-record";
import { useCallback, useMemo } from "react";
import type { SortDirection } from "@cocalc/frontend/components/data-grid";
export type { SortDirection };

export function sortDirections(sortFields: string[]): {
  [field: string]: SortDirection;
} {
  const x: { [field: string]: SortDirection } = {};
  for (const e of sortFields) {
    if (e[0] == "-") {
      x[e.slice(1)] = "descending";
    } else {
      x[e] = "ascending";
    }
  }
  return x;
}

export function parseSort(field?: string): {
  sortField: string;
  direction: SortDirection;
} {
  if (field?.[0] != "-") {
    return { sortField: field ?? "", direction: "ascending" };
  } else {
    return { sortField: field.slice(1), direction: "descending" };
  }
}

export default function useSortFields({
  id,
}: {
  id: string; // id of a view of the given dbtable.
}): [
  sortFields: string[], // ordered array of "field_name" or "-field_name"
  setSortField: (
    field: string,
    newField: string,
    direction: SortDirection | null,
    position?: number
  ) => void
] {
  const [record, setRecord] = useRecord<{
    fields?: string[];
  }>({
    id,
    table: "view-sort-fields",
    defaultValue: { fields: [] },
  });

  const sortFields = useMemo(() => {
    return record.fields ?? [];
  }, [record.fields]);

  const setSortFields = useCallback(
    (fields: string[]) => {
      setRecord({ fields: [...fields] });
    },
    [setRecord]
  );

  const setSortField = useCallback(
    (
      field: string,
      newField: string,
      direction: SortDirection | null, // set to null to delete this sort
      position?: number
    ) => {
      let i = sortFields.indexOf(field);
      if (i == -1) {
        i = sortFields.indexOf("-" + field);
      }
      const value = direction == "ascending" ? newField : "-" + newField;
      if (i == -1) {
        // field not there now, so easy case -- just add it (unless deleting)
        if (direction == null) return;
        if (position != null) {
          sortFields.splice(position, 0, value);
        } else {
          sortFields.push(value);
        }
        setSortFields(sortFields);
        return;
      }
      // Field is there now, so replace it (unless deleting)
      if (direction == null) {
        // deleting
        sortFields.splice(i, 1);
      } else {
        if (position != null && position != i) {
          // moving it too
          sortFields.splice(i, 1);
          sortFields.splice(position, 0, value);
        } else {
          sortFields[i] = value;
        }
      }
      setSortFields(sortFields);
    },
    [setSortFields]
  );

  return [sortFields, setSortField];
}
