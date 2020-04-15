import { EventEmitter } from "events";

export type AsyncCall = (opts: object) => Promise<any>;

import { StripeClient } from "./stripe";
import { ProjectCollaborators } from "./project-collaborators";
import { SupportTickets } from "./support";
import { QueryClient } from "./query";
import { TimeClient } from "./time";
import { AccountClient } from "./account";
import { ProjectClient } from "./project";
import { AdminClient } from "./admin";
import { SyncClient } from "./sync";
import { UsersClient } from "./users";
import { TrackingClient } from "./tracking";
import { Query, QueryOptions } from "smc-util/sync/table";

export interface WebappClient extends EventEmitter {
  stripe: StripeClient;
  project_collaborators: ProjectCollaborators;
  support_tickets: SupportTickets;
  query_client: QueryClient;
  time_client: TimeClient;
  account_client: AccountClient;
  project_client: ProjectClient;
  admin_client: AdminClient;
  sync_client: SyncClient;
  users_client: UsersClient;
  tracking_client: TrackingClient;

  server_time: Function;
  sync_db2: Function;
  get_username: Function;
  is_signed_in: () => boolean;
  remember_me_key: () => string;
  synctable_project: Function;
  project_websocket: Function;
  prettier: Function;
  sync_string: Function;
  sync_db: Function;
  exec: Function; // TODO: rewrite project_actions.ts to not use this at all.
  touch_project: (project_id: string) => Promise<void>;
  log_error: (any) => void;
  async_call: AsyncCall;
  user_tracking: Function;
  send: Function;
  call: Function;
  dbg: (str: string) => Function;
  is_project: () => boolean;
  is_connected: () => boolean;
  query: (opts: {
    query: Query;
    options?: QueryOptions;
    timeout?: number;
    cb?: Function;
  }) => void;
  query_cancel: Function;

  set_connected?: Function;
}

export class Client extends EventEmitter {
  //private client: WebappClient;

  constructor(/* client */) {
    super();
    //this.client = client;
    this.dbg = this.dbg.bind(this);
  }

  public dbg(f): Function {
    return function (...m) {
      let s;
      switch (m.length) {
        case 0:
          s = "";
          break;
        case 1:
          s = m[0];
          break;
        default:
          s = JSON.stringify(m);
      }
      console.log(`${new Date().toISOString()} - Client.${f}: ${s}`);
    };
  }
}
