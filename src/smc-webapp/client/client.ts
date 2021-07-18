/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { bind_methods } from "smc-util/misc";
import { EventEmitter } from "events";
import { delay } from "awaiting";
import { alert_message } from "../alerts";
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
import { FileClient } from "./file";
import { TrackingClient } from "./tracking";
import { HubClient } from "./hub";
import { IdleClient } from "./idle";
import { version } from "smc-util/smc-version";
import { start_metrics } from "../prom-client";

export type AsyncCall = (opts: object) => Promise<any>;

export interface WebappClient extends EventEmitter {
  account_id?: string;

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
  file_client: FileClient;
  tracking_client: TrackingClient;
  hub_client: HubClient;
  idle_client: IdleClient;
  client: Client;

  sync_string: Function;
  sync_db: Function;

  server_time: Function;
  get_username: Function;
  is_signed_in: () => boolean;
  synctable_project: Function;
  project_websocket: Function;
  prettier: Function;
  exec: Function; // TODO: rewrite project_actions.ts to not use this at all.
  touch_project: (project_id: string) => void;
  log_error: (any) => void;
  async_call: AsyncCall;
  user_tracking: Function;
  send: Function;
  call: Function;
  dbg: (str: string) => Function;
  is_project: () => boolean;
  is_connected: () => boolean;
  query: Function;
  query_cancel: Function;
  is_deleted: Function;
  set_deleted: Function;
  mark_file: Function;

  set_connected?: Function;
  version: Function;
}

export const WebappClient = null; // webpack + TS es2020 modules need this


/*
Connection events:
   - 'connecting' -- trying to establish a connection
   - 'connected'  -- succesfully established a connection; data is the protocol as a string
   - 'error'      -- called when an error occurs
   - 'output'     -- received some output for stateless execution (not in any session)
   - 'execute_javascript' -- code that server wants client to run (not for a particular session)
   - 'message'    -- emitted when a JSON message is received           on('message', (obj) -> ...)
   - 'data'       -- emitted when raw data (not JSON) is received --   on('data, (id, data) -> )...
   - 'signed_in'  -- server pushes a succesful sign in to the client (e.g., due to
                     'remember me' functionality); data is the signed_in message.
   - 'project_list_updated' -- sent whenever the list of projects owned by this user
                     changed; data is empty -- browser could ignore this unless
                     the project list is currently being displayed.
   - 'project_data_changed - sent when data about a specific project has changed,
                     e.g., title/description/settings/etc.
   - 'new_version', number -- sent when there is a new version of the source code so client should refresh
*/

class Client extends EventEmitter implements WebappClient {
  account_id?: string;
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
  file_client: FileClient;
  tracking_client: TrackingClient;
  hub_client: HubClient;
  idle_client: IdleClient;
  client: Client;

  sync_string: Function;
  sync_db: Function;

  server_time: Function;
  ping_test: Function;
  get_username: Function;
  is_signed_in: () => boolean;
  synctable_project: Function;
  project_websocket: Function;
  prettier: Function;
  exec: Function; // TODO: rewrite project_actions.ts to not use this at all.
  touch_project: (project_id: string) => void;
  log_error: (any) => void;
  async_call: AsyncCall;
  user_tracking: Function;
  send: Function;
  call: Function;
  is_connected: () => boolean;
  query: Function;
  query_cancel: Function;

  is_deleted: Function;
  mark_file: Function;

  idle_reset: Function;
  latency: Function;
  synctable_database: Function;
  async_query: Function;
  alert_message: Function;

  constructor() {
    super();

    this.dbg = this.dbg.bind(this);

    this.hub_client = bind_methods(new HubClient(this));
    this.is_signed_in = this.hub_client.is_signed_in.bind(this.hub_client);
    this.is_connected = this.hub_client.is_connected.bind(this.hub_client);
    this.call = this.hub_client.call.bind(this.hub_client);
    this.async_call = this.hub_client.async_call.bind(this.hub_client);
    this.latency = this.hub_client.latency.bind(this.hub_client);

    this.stripe = bind_methods(new StripeClient(this.call.bind(this)));
    this.project_collaborators = bind_methods(
      new ProjectCollaborators(this.async_call.bind(this))
    );
    this.support_tickets = bind_methods(
      new SupportTickets(this.async_call.bind(this))
    );
    this.query_client = bind_methods(new QueryClient(this));
    this.time_client = bind_methods(new TimeClient(this));
    this.account_client = bind_methods(new AccountClient(this));
    this.project_client = bind_methods(new ProjectClient(this));

    this.sync_client = bind_methods(new SyncClient(this));
    this.sync_string = this.sync_client.sync_string;
    this.sync_db = this.sync_client.sync_db;

    this.admin_client = bind_methods(
      new AdminClient(this.async_call.bind(this))
    );
    this.users_client = bind_methods(
      new UsersClient(this.call.bind(this), this.async_call.bind(this))
    );
    this.tracking_client = bind_methods(new TrackingClient(this));
    this.file_client = bind_methods(new FileClient(this.async_call.bind(this)));
    this.idle_client = bind_methods(new IdleClient(this));

    // Expose a public API as promised by WebappClient
    this.server_time = this.time_client.server_time.bind(this.time_client);
    this.ping_test = this.time_client.ping_test.bind(this.time_client);

    this.idle_reset = this.idle_client.idle_reset.bind(this.idle_client);

    this.exec = this.project_client.exec.bind(this.project_client);
    this.touch_project = this.project_client.touch.bind(this.project_client);

    this.synctable_database = this.sync_client.synctable_database.bind(
      this.sync_client
    );
    this.synctable_project = this.sync_client.synctable_project.bind(
      this.sync_client
    );

    this.query = this.query_client.query.bind(this.query_client);
    this.async_query = this.query_client.query.bind(this.query_client);
    this.query_cancel = this.query_client.cancel.bind(this.query_client);

    this.is_deleted = this.file_client.is_deleted.bind(this.file_client);
    this.mark_file = this.file_client.mark_file.bind(this.file_client);

    this.alert_message = alert_message;

    // Tweaks the maximum number of listeners an EventEmitter can have --
    // 0 would mean unlimited
    // The issue is https://github.com/sagemathinc/cocalc/issues/1098 and
    // the errors we got are
    //   (node) warning: possible EventEmitter memory leak detected.
    //          301 listeners added.
    //          Use emitter.setMaxListeners() to increase limit.
    // every open file/table/sync db listens for connect event, which adds up.
    this.setMaxListeners(3000);

    // start pinging -- not used/needed for primus,
    // but *is* needed for getting information about
    // server_time skew and showing ping time to user.
    // Starting pinging a few seconds after connecting the first time,
    // after things have settled down a little (to not throw off ping time).
    this.once("connected", async () => {
      await delay(5000);
      this.time_client.ping();
    });

    this.init_prom_client();
    this.init_global_cocalc();

    bind_methods(this);
  }

  private async init_global_cocalc(): Promise<void> {
    await delay(1);
    require("./console").setup_global_cocalc(this);
  }

  private init_prom_client(): void {
    this.on("start_metrics", start_metrics);
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

  public version(): number {
    return version;
  }

  // account_id of this client
  public client_id(): string | undefined {
    return this.account_id;
  }

  // false since this client is not a project
  public is_project(): boolean {
    return false;
  }

  // true since this client is a user
  public is_user(): boolean {
    return true;
  }

  public set_deleted(): void {
    throw Error("not implemented for frontend");
  }
}

export const webapp_client = new Client();
