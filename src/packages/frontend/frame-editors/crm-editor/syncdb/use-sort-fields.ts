import useRecord from "./use-record";
import { useCallback, useMemo } from "react";
export type SortDirection = "ascending" | "descending";

export default function useSortFields({
  id,
}: {
  id: string; // id of a view if the given dbtable.
}): [
  sortFields: string[], // ordered array of "field_name" or "-field_name"
  setSortField: (
    field: string,
    newField: string,
    direction: SortDirection | null
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
    [sortFields, setRecord]
  );

  const setSortField = useCallback(
    (field: string, newField: string, direction: SortDirection | null) => {
      let i = sortFields.indexOf(field);
      if (i == -1) {
        i = sortFields.indexOf("-" + field);
      }
      const value = direction == "ascending" ? newField : "-" + newField;
      if (i == -1) {
        // field not there now, so easy case -- just add it (unless deleting)
        if (!newField) return;
        sortFields.push(value);
        setSortFields(sortFields);
        return;
      }
      // Field is there now, so replace it (unless deleting)
      if (!newField) {
        // deleting
        sortFields.splice(i, 1);
      } else {
        sortFields[i] = value;
      }
      setSortFields(sortFields);
    },
    [setSortFields]
  );

  return [sortFields, setSortField];
}
