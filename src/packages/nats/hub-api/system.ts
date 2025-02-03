import { noAuth, authFirst } from "./util";
import type { Customize } from "@cocalc/util/db-schema/server-settings";

export const system = {
  getCustomize: noAuth,
  ping: noAuth,
  addProjectPermission: authFirst,
  terminate: authFirst,
  userTracking: authFirst,
};

export interface System {
  // get all or specific customize data
  getCustomize: (fields?: string[]) => Promise<Customize>;
  // ping server and get back the current time
  ping: () => { now: number };
  // request to have NATS permissions to project subjects.
  addProjectPermission: (opts: { project_id: string }) => Promise<void>;
  // terminate a service:
  //   - only admin can do this.
  //   - useful for development
  terminate: (service: "database" | "api") => Promise<void>;
  userTracking: (opts: {
    event: string;
    value: object;
    account_id?: string;
  }) => Promise<void>;
}
