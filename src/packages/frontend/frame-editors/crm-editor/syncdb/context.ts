import { createContext, useContext } from "react";
import { SyncDB } from "@cocalc/sync/editor/db";

interface Context {
  syncdb: SyncDB;
}

export const SyncdbContext = createContext<Context | null>(null);

export function useSyncdbContext() {
  return useContext(SyncdbContext);
}
