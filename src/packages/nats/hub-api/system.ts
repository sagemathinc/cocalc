import { noAuth, authFirst } from "./util";
import type { Customize } from "@cocalc/util/db-schema/server-settings";

export const system = {
  getCustomize: noAuth,
  ping: noAuth,
  addProjectPermission: authFirst,
};

export interface System {
  getCustomize: (fields?: string[]) => Promise<Customize>;
  ping: () => { now: number };
  addProjectPermission: (opts: { project_id: string }) => Promise<void>;
}
