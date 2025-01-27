import { noAuth } from "./util";
import type { Customize } from "@cocalc/util/db-schema/server-settings";

export const system = {
  getCustomize: noAuth,
  ping: noAuth,
};

export interface System {
  getCustomize: (fields?: string[]) => Promise<Customize>;
  ping: () => { now: number };
}
