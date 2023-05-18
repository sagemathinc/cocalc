import { EventEmitter } from "events";
import type { AppClient } from "@cocalc/sync/client/types";
import { SyncClient } from "@cocalc/sync/client/sync-client";
import ProjectClient from "./project-client";
import debug from "debug";
import { bind_methods } from "@cocalc/util/misc";

export default class Client extends EventEmitter implements AppClient {
  project_client: ProjectClient;
  sync_client: SyncClient;
  synctable_project: Function;

  constructor() {
    super();
    this.project_client = bind_methods(new ProjectClient());
    this.sync_client = bind_methods(new SyncClient(this));
    this.synctable_project = this.sync_client.synctable_project.bind(
      this.sync_client
    );
    bind_methods(this);
  }

  is_project(): boolean {
    return false;
  }

  dbg(str: string): Function {
    return debug(`cocalc:sync:client.${str}`);
  }

  query(opts) {
    this.dbg("query")(opts);
    if (typeof opts?.query != "object") {
      throw Error("opts.query must be specified");
    }
    let project_id;
    for (const table in opts.query) {
      if (opts.query[table].project_id) {
        project_id = opts.query[table].project_id;
        break;
      }
      if (opts.query[table][0]?.project_id) {
        project_id = opts.query[table][0]?.project_id;
        break;
      }
    }
    if (!project_id) {
      throw Error(
        "only queries involving an explicit project_id are supported"
      );
    }
    (async () => {
      const api = await this.project_client.api(project_id);
      const result = await api.query(opts);
      opts.cb?.(undefined, result);
    })();
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
