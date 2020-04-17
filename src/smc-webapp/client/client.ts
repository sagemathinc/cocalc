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
import { HubClient } from "./hub";
import { Query, QueryOptions } from "smc-util/sync/table";
import { version } from "smc-util/smc-version";

export class Client extends EventEmitter {
  //private client: WebappClient;

  constructor(/* client */) {
    super();
    //this.client = client;
    this.dbg = this.dbg.bind(this);
  }

  public remember_me_key(): string {
    const app_base_url = (window as any).app_base_url ?? "";
    return "remember_me" + app_base_url;
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

  public version(): string {
    return version;
  }
}

export interface WebappClient extends EventEmitter {
  public account_id?: string;

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
  hub_client: HubClient;
  client: Client;

  sync_string: Function;
  sync_db: Function;

  server_time: Function;
  get_username: Function;
  is_signed_in: () => boolean;
  remember_me_key: () => string;
  synctable_project: Function;
  project_websocket: Function;
  prettier: Function;
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
  public mark_file(opts: {
    project_id: string;
    path: string;
    action: string;
    ttl?: number;
  }): Promise<void>;
}
