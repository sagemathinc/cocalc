import useRecord from "./use-record";
import { useCallback, useMemo } from "react";

export const DEFAULT_LIMIT = 100;

export default function useLimit({
  id,
}: {
  id: string; // id of a view of the given dbtable.
}): [limit: number, setLimit: (limit: number) => void] {
  const [record, setRecord] = useRecord<{
    limit?: number;
  }>({
    id,
    table: "view-limit",
    defaultValue: { limit: DEFAULT_LIMIT },
  });

  const limit = useMemo(() => {
    return record.limit ?? DEFAULT_LIMIT;
  }, [record.limit]);

  const setLimit = useCallback(
    (limit: number) => {
      setRecord({ limit });
    },
    [setRecord]
  );

  return [limit, setLimit];
}
