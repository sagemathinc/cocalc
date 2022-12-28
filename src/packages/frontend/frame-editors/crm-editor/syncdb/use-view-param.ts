import useRecord from "./use-record";
import { useCallback, useMemo } from "react";

export default function useViewParam<T>({
  name,
  id,
  defaultValue,
}: {
  name: string; // name of param, e.g., "limit", "search", "height"
  id: string; // id of a view of the given dbtable.
  defaultValue: T;
}): [value: T, setValue: (limit: T) => void] {
  const [record, setRecord] = useRecord<{
    value?: T;
  }>({
    id,
    table: `view-${name}`,
    defaultValue: { value: defaultValue },
  });

  const value = useMemo(() => {
    return record.value ?? defaultValue;
  }, [record.value]);

  const setValue = useCallback(
    (value: T | undefined | null) => {
      setRecord({ value: value ?? defaultValue });
    },
    [setRecord]
  );

  return [value, setValue];
}
