import useRecord from "./use-record";
import { useCallback, useMemo } from "react";

export default function useHiddenFields({
  id,
}: {
  id: string; // id of a view if the given dbtable.
}): [
  hiddenFields: Set<string>,
  setHiddenField: (field: string, hide: boolean) => void
] {
  const [record, setRecord] = useRecord<{
    fields?: string[];
  }>({
    id,
    table: "view-hidden-fields",
    defaultValue: { fields: [] },
  });

  const hiddenFields = useMemo(() => {
    return new Set(record.fields ?? []);
  }, [record]);

  const setHiddenField = useCallback(
    (field: string, hide: boolean) => {
      if (hide) {
        // hide
        if (hiddenFields.has(field)) {
          return;
        }
        hiddenFields.add(field);
      } else {
        // show
        if (hiddenFields.has(field)) {
          hiddenFields.delete(field);
        } else {
          return;
        }
      }
      setRecord({ fields: Array.from(hiddenFields) });
    },
    [hiddenFields, setRecord]
  );

  return [hiddenFields, setHiddenField];
}
