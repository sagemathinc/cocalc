/*
The widths of fields in the grid view.

Fields have a default hard coded width, but the user may adjust the widths. The
modified widths for a given view are organized and saved in the syncdb via this
hook.

*/

import useRecord from "./use-record";
import { useCallback } from "react";

type FieldWidths = { [field: string]: number };

export default function useFieldWidths({
  id,
}: {
  id: string; // id of a view of the given table.
}): [
  fieldWidths: FieldWidths, // map from fields to their width; default is empty map, i.e., use defaults
  setFieldWidths: (fieldWidths: FieldWidths) => void
] {
  const [record, setRecord] = useRecord<{
    widths?: FieldWidths;
  }>({
    id,
    table: "view-field-widths",
    defaultValue: {},
  });

  const setFieldWidths = useCallback(
    (fieldWidths: FieldWidths) => {
      setRecord({ widths: fieldWidths });
    },
    [setRecord]
  );

  return [record.widths ?? {}, setFieldWidths];
}
