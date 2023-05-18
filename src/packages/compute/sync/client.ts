import { EventEmitter } from "events";
import type { AppClient } from "@cocalc/sync/client/types";
import { SyncClient } from "@cocalc/sync/client/sync-client";
import ProjectClient from "./project-client";
import debug from "debug";
import { bind_methods } from "@cocalc/util/misc";

export default class Client extends EventEmitter implements AppClient {
  project_client: ProjectClient;
  sync_client: SyncClient;

  constructor() {
    super();
    this.project_client = bind_methods(new ProjectClient());
    this.sync_client = bind_methods(new SyncClient(this));
    bind_methods(this);
  }

  is_project(): boolean {
    return false;
  }

  dbg(str: string): Function {
    return debug(`cocalc:sync:client.${str}`);
  }

  query(opts) {
    this.dbg("query")("STUB", opts);
  }

  query_cancel() {
    console.log("query_cancel");
  }

  server_time() {
    return new Date();
  }

  is_connected(): boolean {
    return true;
  }

  is_signed_in(): boolean {
    return true;
  }

  touch_project(_project_id: string): void {}
}
