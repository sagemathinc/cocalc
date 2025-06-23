/*
This is specifically meant for connecting to one project.

Example use:

~/cocalc/src/packages/sync-client$ PROJECT_PORT=33177 DEBUG='cocalc:sync*' node
...

> c = new (require('.').default)(); s = c.sync_client.sync_db({project_id:'97ce5a7c-25c1-4059-8670-c7de96a0db92',path:'b.tasks',primary_keys:["task_id"], string_cols:['desc']})

> s.set({task_id:'cf163fb4-b198-4664-b32b-82ce4ec71701',desc:"fubar"})
> await s.save()
> s.to_str()
'{"desc":"fubar","last_edited":1684420716277,"position":0,"task_id":"cf163fb4-b198-4664-b32b-82ce4ec71701"}'
> s.set({task_id:'cf163fb4-b198-4664-b32b-82ce4ec71701',desc:"figure it out"})
undefined
> await s.save()
undefined
> s.to_str()
'{"desc":"figure it out","last_edited":1684420716277,"position":0,"task_id":"cf163fb4-b198-4664-b32b-82ce4ec71701"}'
*/

import { EventEmitter } from "events";
import type { AppClient } from "@cocalc/sync/client/types";
import { SyncClient } from "@cocalc/sync/client/sync-client";
import ProjectClient from "./project-client";
import debug from "debug";
import { bind_methods, isValidUUID, uuid } from "@cocalc/util/misc";
import { project } from "@cocalc/api-client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export type Role = "project" | "browser" | "compute_server";

interface Options {
  project_id: string;
  client_id?: string;
  role: Role;
}

export default class Client extends EventEmitter implements AppClient {
  project_client: ProjectClient;
  sync_client: SyncClient;
  synctable_project: Function;
  project_id: string;
  _client_id: string;
  private role: Role;

  constructor({ project_id, client_id = uuid(), role }: Options) {
    super();
    this._client_id = client_id;
    this.project_id = project_id;
    this.role = role;

    if (!isValidUUID(project_id)) {
      throw Error("project_id must be a valid uuid");
    }

    this.project_client = bind_methods(new ProjectClient());
    this.sync_client = bind_methods(new SyncClient(this));
  }

  client_id = () => {
    return this._client_id;
  };

  // [ ] TODO: is this something we should worry about?  Probably yes.
  is_deleted = (_filename: string, _project_id: string) => {
    return false;
  };

  set_deleted = async (_filename: string, _project_id?: string) => {
    // TODO -- implement in fs aware clients
  };

  mark_file = async (_opts: any) => {
    // [ ] TODO: should we?
  };

  is_project = () => {
    return this.role == "project";
  };

  is_browser = () => {
    return this.role == "browser";
  };

  is_compute_server = () => {
    return this.role == "compute_server";
  };

  dbg = (str: string) => {
    return debug(`cocalc:sync:client.${str}`);
  };

  query = (opts) => {
    this.dbg("query")(opts);
    if (typeof opts?.query != "object") {
      throw Error("opts.query must be specified");
    }
    let project_id = this.project_id;
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
        "query involving an explicit project_id or clients with project_id set are supported",
      );
    }
    (async () => {
      try {
        const api = await this.project_client.api(project_id);
        const result = await api.query(opts);
        opts.cb?.(undefined, result);
      } catch (err) {
        opts.cb?.(`${err}`);
      }
    })();
  };

  query_cancel = () => {
    console.log("query_cancel");
  };

  server_time = () => {
    return new Date();
  };

  is_connected = () => {
    return true;
  };

  is_signed_in = () => {
    return true;
  };

  private _touchProject = reuseInFlight(async (project_id: string) => {
    const dbg = this.dbg("sync-client:_touchProject");
    dbg(project_id);
    try {
      await project.touch({ project_id });
    } catch (err) {
      dbg("error ", err);
    }
  });

  touch_project = (project_id: string, _compute_server_id?: number) => {
    this._touchProject(project_id);
  };
}
