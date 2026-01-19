import { useCallback, useMemo } from "react";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import type { ProjectStoreState } from "@cocalc/frontend/project_store";

export function useFindTabState<T extends Record<string, any>>(
  project_id: string,
  key: keyof ProjectStoreState,
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const actions = useActions({ project_id });
  const stored = useTypedRedux({ project_id }, key) as T | undefined;
  const storedValue = useMemo(() => {
    if (stored && typeof (stored as any).toJS === "function") {
      return (stored as any).toJS() as T;
    }
    return stored;
  }, [stored]);
  const value = useMemo(() => ({ ...defaults, ...(storedValue ?? {}) }), [
    defaults,
    storedValue,
  ]);
  const update = useCallback(
    (patch: Partial<T>) => {
      if (!actions) return;
      actions.setState({ [key]: { ...value, ...patch } });
    },
    [actions, key, value],
  );
  return [value, update];
}
