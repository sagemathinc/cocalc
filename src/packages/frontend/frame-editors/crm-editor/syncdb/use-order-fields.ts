/*
The order in which fields are presented for display and editing in a given view.

The caller will always get an array of all sorted columns, which is why fields
must be passed in.

What we actually store is an array of strings as follows,
as implemented in the normalize function below:

- "[]" should be interpretted as "use the default order".
- more generally, if the array if ['field1', 'field2'], this means that
  field1 and field2 are first in that order, and all other fields should be included
  in whatever the default order is (as specified in the ../tables/ subdirectory).
- Also, anything in the array not in fields is removed.

This ensures the sort is robust and preserved upon schema change.
*/

import useRecord from "./use-record";
import { useCallback, useMemo } from "react";

export default function useOrderFields({
  id,
  fields,
}: {
  id: string; // id of a view of the given table.
  fields: string[];
}): [
  orderFields: string[], // ordered array of "field_name"
  setOrderFields: (orderFields: string[]) => void
] {
  const [record, setRecord] = useRecord<{
    fields?: string[];
  }>({
    id,
    table: "view-order-fields",
    defaultValue: { fields: [] },
  });

  const orderFields = useMemo(() => {
    return normalize(record.fields ?? [], fields);
  }, [record.fields, fields]);

  const setOrderFields = useCallback(
    (orderFields: string[]) => {
      setRecord({ fields: normalize([...orderFields], fields) });
    },
    [setRecord]
  );

  return [orderFields, setOrderFields];
}

function normalize(fields: string[], all: string[]): string[] {
  const allSet = new Set(all);
  fields = fields.filter((field) => allSet.has(field));
  const fieldsSet = new Set(fields);
  const missing = all.filter((field) => !fieldsSet.has(field));
  return fields.concat(missing);
}
