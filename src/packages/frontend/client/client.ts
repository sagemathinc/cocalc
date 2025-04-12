/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { bind_methods } from "@cocalc/util/misc";
import { EventEmitter } from "events";
import { delay } from "awaiting";
import { alert_message } from "../alerts";
import { StripeClient } from "./stripe";
import { ProjectCollaborators } from "./project-collaborators";
import { Messages } from "./messages";
import { QueryClient } from "./query";
import { TimeClient } from "./time";
import { AccountClient } from "./account";
import { ProjectClient } from "./project";
import { AdminClient } from "./admin";
import { LLMClient } from "./llm";
import { PurchasesClient } from "./purchases";
import { JupyterClient } from "./jupyter";
import { SyncClient } from "@cocalc/sync/client/sync-client";
import { UsersClient } from "./users";
import { FileClient } from "./file";
import { TrackingClient } from "./tracking";
import { NatsClient } from "@cocalc/frontend/nats/client";
import { HubClient } from "./hub";
import { IdleClient } from "./idle";
import { version } from "@cocalc/util/smc-version";
import { setup_global_cocalc } from "./console";
import { Query } from "@cocalc/sync/table";
import debug from "debug";
import Cookies from "js-cookie";
import { basePathCookieName } from "@cocalc/util/misc";
import { ACCOUNT_ID_COOKIE_NAME } from "@cocalc/util/db-schema/accounts";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import type { NatsSyncTableFunction } from "@cocalc/nats/sync/synctable";
import type {
  CallNatsServiceFunction,
  CreateNatsServiceFunction,
} from "@cocalc/nats/service";
import type { NatsEnvFunction } from "@cocalc/nats/types";
import { randomId } from "@cocalc/nats/names";

// This DEBUG variable comes from webpack:
declare const DEBUG;

const log = debug("cocalc");
// To get actual extreme logging though you have to also set
//
// localStorage.DEBUG='cocalc'
//
// and refresh your browser.  Example, this will turn on
// all the sync activity logging and everything that calls
// client.dbg.

export const ACCOUNT_ID_COOKIE = decodeURIComponent(
  basePathCookieName({
    basePath: appBasePath,
    name: ACCOUNT_ID_COOKIE_NAME,
  }),
);

export type AsyncCall = (opts: object) => Promise<any>;

export interface WebappClient extends EventEmitter {
  account_id?: string;
  browser_id: string;
  stripe: StripeClient;
  project_collaborators: ProjectCollaborators;
  messages: Messages;
  query_client: QueryClient;
  time_client: TimeClient;
  account_client: AccountClient;
  project_client: ProjectClient;
  admin_client: AdminClient;
  openai_client: LLMClient;
  purchases_client: PurchasesClient;
  jupyter_client: JupyterClient;
  sync_client: SyncClient;
  users_client: UsersClient;
  file_client: FileClient;
  tracking_client: TrackingClient;
  nats_client: NatsClient;
  hub_client: HubClient;
  idle_client: IdleClient;
  client: Client;

  sync_string: Function;
  sync_db: Function;

  server_time: Function;
  get_username: Function;
  is_signed_in: () => boolean;
  synctable_project: Function;
  synctable_nats: NatsSyncTableFunction;
  callNatsService: CallNatsServiceFunction;
  createNatsService: CreateNatsServiceFunction;
  getNatsEnv: NatsEnvFunction;
  pubsub_nats: Function;
  project_websocket: Function;
  prettier: Function;
  exec: Function;
  touch_project: (project_id: string, compute_server_id?: number) => void;
  ipywidgetsGetBuffer: (
    project_id: string,
    path: string,
    model_id: string,
    buffer_path: string,
  ) => Promise<ArrayBuffer>;
  log_error: (any) => void;
  async_call: AsyncCall;
  user_tracking: Function;
  send: Function;
  call: Function;
  dbg: (str: string) => Function;
  is_project: () => boolean;
  is_browser: () => boolean;
  is_compute_server: () => boolean;
  is_connected: () => boolean;
  query: Query; // TODO typing
  query_cancel: Function;
  is_deleted: (filename: string, project_id: string) => boolean;
  set_deleted: Function;
  mark_file: (opts: any) => Promise<void>;
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
  account_id: string = Cookies.get(ACCOUNT_ID_COOKIE);
  browser_id: string = randomId();
  stripe: StripeClient;
  project_collaborators: ProjectCollaborators;
  messages: Messages;
  query_client: QueryClient;
  time_client: TimeClient;
  account_client: AccountClient;
  project_client: ProjectClient;
  admin_client: AdminClient;
  openai_client: LLMClient;
  purchases_client: PurchasesClient;
  jupyter_client: JupyterClient;
  sync_client: SyncClient;
  users_client: UsersClient;
  file_client: FileClient;
  tracking_client: TrackingClient;
  nats_client: NatsClient;
  hub_client: HubClient;
  idle_client: IdleClient;
  client: Client;

  sync_string: Function;
  sync_db: Function;

  server_time: Function; // TODO: make this () => Date and deal with the fallout
  ping_test: Function;
  get_username: Function;
  is_signed_in: () => boolean;
  synctable_project: Function;
  synctable_nats: NatsSyncTableFunction;
  callNatsService: CallNatsServiceFunction;
  createNatsService: CreateNatsServiceFunction;
  getNatsEnv: NatsEnvFunction;
  pubsub_nats: Function;
  project_websocket: Function;
  prettier: Function;
  exec: Function;
  touch_project: (project_id: string, compute_server_id?: number) => void;
  ipywidgetsGetBuffer: (
    project_id: string,
    path: string,
    model_id: string,
    buffer_path: string,
  ) => Promise<ArrayBuffer>;

  log_error: (any) => void;
  async_call: AsyncCall;
  user_tracking: Function;
  send: Function;
  call: Function;
  is_connected: () => boolean;
  query: typeof QueryClient.prototype.query;
  query_cancel: Function;

  is_deleted: (filename: string, project_id: string) => boolean;
  mark_file: (opts: any) => Promise<void>;

  idle_reset: Function;
  latency: Function;
  synctable_database: Function;
  async_query: Function;
  alert_message: Function;

  constructor() {
    super();
    if (DEBUG) {
      this.dbg = this.dbg.bind(this);
    } else {
      this.dbg = (..._) => {
        return (..._) => {};
      };
    }
    this.hub_client = bind_methods(new HubClient(this));
    this.is_signed_in = this.hub_client.is_signed_in.bind(this.hub_client);
    this.is_connected = this.hub_client.is_connected.bind(this.hub_client);
    this.call = this.hub_client.call.bind(this.hub_client);
    this.async_call = this.hub_client.async_call.bind(this.hub_client);
    this.latency = this.hub_client.latency.bind(this.hub_client);

    this.stripe = bind_methods(new StripeClient(this.call.bind(this)));
    this.project_collaborators = bind_methods(
      new ProjectCollaborators(this.async_call.bind(this)),
    );
    this.messages = new Messages();
    this.query_client = bind_methods(new QueryClient(this));
    this.time_client = bind_methods(new TimeClient(this));
    this.account_client = bind_methods(new AccountClient(this));
    this.project_client = bind_methods(new ProjectClient(this));

    this.sync_client = bind_methods(new SyncClient(this));
    this.sync_string = this.sync_client.sync_string;
    this.sync_db = this.sync_client.sync_db;

    this.admin_client = bind_methods(new AdminClient(this));
    this.openai_client = bind_methods(new LLMClient(this));
    this.purchases_client = bind_methods(new PurchasesClient(this));
    this.jupyter_client = bind_methods(
      new JupyterClient(this.async_call.bind(this)),
    );
    this.users_client = bind_methods(new UsersClient(this));
    this.tracking_client = bind_methods(new TrackingClient(this));
    this.nats_client = bind_methods(new NatsClient(this));
    this.file_client = bind_methods(new FileClient(this.async_call.bind(this)));
    this.idle_client = bind_methods(new IdleClient(this));

    // Expose a public API as promised by WebappClient
    this.server_time = this.time_client.server_time.bind(this.time_client);
    this.ping_test = this.time_client.ping_test.bind(this.time_client);

    this.idle_reset = this.idle_client.idle_reset.bind(this.idle_client);

    this.exec = this.project_client.exec.bind(this.project_client);
    this.touch_project = this.project_client.touch_project.bind(
      this.project_client,
    );
    this.ipywidgetsGetBuffer = this.project_client.ipywidgetsGetBuffer.bind(
      this.project_client,
    );

    this.synctable_database = this.sync_client.synctable_database.bind(
      this.sync_client,
    );
    this.synctable_project = this.sync_client.synctable_project.bind(
      this.sync_client,
    );
    this.synctable_nats = this.nats_client.synctable;
    this.pubsub_nats = this.nats_client.pubsub;
    this.callNatsService = this.nats_client.callNatsService;
    this.createNatsService = this.nats_client.createNatsService;
    this.getNatsEnv = this.nats_client.getEnv;

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
    this.once("connected", async () => {
      this.time_client.ping(true);
      // Ping again a few seconds after connecting the first time,
      // after things have settled down a little (to not throw off
      // ping time).
      await delay(5000);
      this.time_client.ping(); // this will ping periodically
    });

    this.init_global_cocalc();

    bind_methods(this);
  }

  private async init_global_cocalc(): Promise<void> {
    await delay(1);
    setup_global_cocalc(this);
  }

  public dbg(f): Function {
    if (log.enabled) {
      return (...args) => log(new Date().toISOString(), f, ...args);
    } else {
      return (..._) => {};
    }
    //     return function (...m) {
    //       console.log(`${new Date().toISOString()} - Client.${f}: `, ...m);
    //     };
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

  public is_browser(): boolean {
    return true;
  }

  public is_compute_server(): boolean {
    return false;
  }

  // true since this client is a user
  public is_user(): boolean {
    return true;
  }

  public set_deleted(): void {
    throw Error("not implemented for frontend");
  }

  touchOpenFile = async ({
    project_id,
    path,
    setNotDeleted,
    // id
  }: {
    project_id: string;
    path: string;
    id?: number;
    // if file is deleted, this explicitly undeletes it.
    setNotDeleted?: boolean;
  }) => {
    const x = await this.nats_client.openFiles(project_id);
    if (setNotDeleted) {
      x.setNotDeleted(path);
    }
    x.touch(path);
  };
}

export const webapp_client = new Client();
