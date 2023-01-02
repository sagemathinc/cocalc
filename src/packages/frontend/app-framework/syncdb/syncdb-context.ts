import { createContext, useContext } from "react";
import { SyncDB } from "@cocalc/sync/editor/db";

interface Context {
  syncdb: SyncDB | null;
}

export const SyncdbContext = createContext<Context>({ syncdb: null });

export function useSyncdbContext() {
  return useContext(SyncdbContext);
}
