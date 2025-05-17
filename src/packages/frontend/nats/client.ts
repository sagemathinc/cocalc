import * as nats from "nats.ws";
import { connect, type CoCalcNatsConnection } from "./connection";
import { redux } from "@cocalc/frontend/app-framework";
import type { WebappClient } from "@cocalc/frontend/client/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import * as jetstream from "@nats-io/jetstream";
import {
  createSyncTable,
  type NatsSyncTable,
  NatsSyncTableFunction,
} from "@cocalc/nats/sync/synctable";
import { randomId, inboxPrefix } from "@cocalc/nats/names";
import { projectSubject } from "@cocalc/nats/names";
import { parse_query } from "@cocalc/sync/table/util";
import { sha1 } from "@cocalc/util/misc";
import { keys } from "lodash";
import { type HubApi, initHubApi } from "@cocalc/nats/hub-api";
import { type ProjectApi, initProjectApi } from "@cocalc/nats/project-api";
import { getPrimusConnection } from "@cocalc/nats/primus";
import { isValidUUID } from "@cocalc/util/misc";
import { createOpenFiles, OpenFiles } from "@cocalc/nats/sync/open-files";
import { PubSub } from "@cocalc/nats/sync/pubsub";
import type { ChatOptions } from "@cocalc/util/types/llm";
import { kv, type KVOptions, type KV } from "@cocalc/nats/sync/kv";
import { dkv, type DKVOptions, type DKV } from "@cocalc/nats/sync/dkv";
import { dko, type DKO } from "@cocalc/nats/sync/dko";
import {
  stream,
  type UserStreamOptions,
  type Stream,
} from "@cocalc/nats/sync/stream";
import { dstream } from "@cocalc/nats/sync/dstream";
import { delay } from "awaiting";
import { callNatsService, createNatsService } from "@cocalc/nats/service";
import type {
  CallNatsServiceFunction,
  CreateNatsServiceFunction,
} from "@cocalc/nats/service";
import { listingsClient } from "@cocalc/nats/service/listings";
import {
  computeServerManager,
  type Options as ComputeServerManagerOptions,
} from "@cocalc/nats/compute/manager";
import getTime, { getSkew, init as initTime } from "@cocalc/nats/time";
import { llm } from "@cocalc/nats/llm/client";
import { inventory } from "@cocalc/nats/sync/inventory";
import { EventEmitter } from "events";
import {
  getClient as getClientWithState,
  setNatsClient,
  type ClientWithState,
  getEnv,
} from "@cocalc/nats/client";
import type { ConnectionInfo } from "./types";
import { fromJS } from "immutable";
import Cookies from "js-cookie";
import { ACCOUNT_ID_COOKIE } from "@cocalc/frontend/client/client";
import { isConnected, waitUntilConnected } from "@cocalc/nats/util";
import { info as refCacheInfo } from "@cocalc/util/refcache";
import * as tieredStorage from "@cocalc/nats/tiered-storage/client";
import { connect as connectToConat } from "@cocalc/nats/server/client";
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

const NATS_STATS_INTERVAL = 2500;

const DEFAULT_TIMEOUT = 15000;

declare var DEBUG: boolean;

export class NatsClient extends EventEmitter {
  client: WebappClient;
  private sc = nats.StringCodec();
  private jc = nats.JSONCodec();
  private nc?: CoCalcNatsConnection;
  public nats = nats;
  public jetstream = jetstream;
  public hub: HubApi;
  public sessionId = randomId();
  private openFilesCache: { [project_id: string]: OpenFiles } = {};
  private clientWithState: ClientWithState;
  private _conatClient: null | ReturnType<typeof connectToConat>;

  constructor(client: WebappClient) {
    super();
    this.setMaxListeners(100);
    this.client = client;
    this.hub = initHubApi(this.callHub);
    this.initNatsClient();
    this.on("state", (state) => {
      this.emit(state);
      this.setConnectionState(state);
    });
  }

  conat = () => {
    if (this._conatClient == null) {
      this._conatClient = connectToConat("/", {
        path: join(appBasePath, "conat"),
        inboxPrefix: inboxPrefix({ account_id: this.client.account_id }),
      });
    }
    return this._conatClient!;
  };

  private initNatsClient = async () => {
    let d = 100;
    // wait until you're signed in -- usually the account_id cookie ensures this,
    // but if somehow it got deleted, the normal websocket sign in message from the
    // hub also provides the account_id right now.  That will eventually go away,
    // at which point this should become fatal.
    if (!this.client.account_id) {
      while (!this.client.account_id) {
        await delay(d);
        d = Math.min(3000, d * 1.3);
      }
      // we know the account_id, so set it so next time sign is faster.
      Cookies.set(ACCOUNT_ID_COOKIE, this.client.account_id);
    }
    setNatsClient({
      account_id: this.client.account_id,
      getNatsEnv: this.getNatsEnv,
      reconnect: this.reconnect,
      getLogger: DEBUG
        ? (name) => {
            return {
              info: (...args) => console.info(name, ...args),
              debug: (...args) => console.log(name, ...args),
              warn: (...args) => console.warn(name, ...args),
            };
          }
        : undefined,
    });
    this.clientWithState = getClientWithState();
    this.clientWithState.on("state", (state) => {
      if (state != "closed") {
        console.log("NATS: ", state);
        this.emit(state);
      }
    });
    initTime();
  };

  getEnv = async () => await getEnv();

  private getConnection = reuseInFlight(async () => {
    if (this.nc != null) {
      return this.nc;
    }
    this.nc = await connect();
    this.setConnectionState("connected");
    this.monitorConnectionState(this.nc);
    this.reportConnectionStats(this.nc);
    return this.nc;
  });

  reconnect = reuseInFlight(async () => {
    if (this.nc != null) {
      console.log("NATS connection: reconnecting...");
      this.standby();
      await delay(50);
      await this.resume();
    }
  });

  // if there is a connection, put it in standby
  standby = () => {
    this.nc?.standby();
  };
  // if there is a connection, resume it
  resume = async () => {
    await this.nc?.resume();
  };

  // reconnect to nats with access to additional projects.
  // If you request projects that you're not actually a collaborator
  // on, then it will silently NOT give you permission to use them.
  addProjectPermissions = async (project_ids: string[]) => {
    if (this.nc == null) {
      throw Error("must have a connection");
    }
    await this.nc.addProjectPermissions(project_ids);
  };

  private setConnectionState = (state?) => {
    const page = redux?.getActions("page");
    if (page == null) {
      return;
    }
    page.setState({
      nats: {
        state: state ?? this.clientWithState.state,
        data: this.nc?.stats(),
      },
    } as any);
  };

  private monitorConnectionState = async (nc) => {
    for await (const _ of nc.statusOfCurrentConnection()) {
      this.setConnectionState();
    }
  };

  private reportConnectionStats = async (nc) => {
    while (true) {
      const store = redux?.getStore("page");
      const actions = redux?.getActions("page");
      if (store != null && actions != null) {
        const cur = store.get("nats") ?? (fromJS({}) as any);
        const nats = cur.set("data", fromJS(nc.stats()));
        if (!cur.equals(nats)) {
          actions.setState({ nats });
        }
      }
      await delay(NATS_STATS_INTERVAL);
    }
  };

  callNatsService: CallNatsServiceFunction = async (options) => {
    return await callNatsService(options);
  };

  createNatsService: CreateNatsServiceFunction = (options) => {
    return createNatsService(options);
  };

  // TODO: plan to deprecated...?
  projectWebsocketApi = async ({
    project_id,
    mesg,
    timeout = DEFAULT_TIMEOUT,
  }) => {
    const { cn } = await this.getEnv();
    const subject = projectSubject({ project_id, service: "browser-api" });
    const resp = await cn.request(subject, mesg, {
      timeout,
    });
    return resp.data;
  };

  private callHub = async ({
    service = "api",
    name,
    args = [],
    timeout = DEFAULT_TIMEOUT,
  }: {
    service?: string;
    name: string;
    args: any[];
    timeout?: number;
  }) => {
    const { cn } = await this.getEnv();
    const subject = `hub.account.${this.client.account_id}.${service}`;
    try {
      const data = { name, args };
      const resp = await cn.request(subject, data, { timeout });
      return resp.data;
    } catch (err) {
      err.message = `${err.message} - callHub: subject='${subject}', name='${name}', `;
      throw err;
    }
  };

  // Returns api for RPC calls to the project with typescript support!
  // if compute_server_id is NOT given then:
  //    if path is given use compute server id for path (assuming mapping is loaded)
  //    if path is not given, use current project default
  projectApi = ({
    project_id,
    compute_server_id,
    path,
    timeout = DEFAULT_TIMEOUT,
  }: {
    project_id: string;
    path?: string;
    compute_server_id?: number;
    // IMPORTANT: this timeout is only AFTER user is connected.
    timeout?: number;
  }): ProjectApi => {
    if (!isValidUUID(project_id)) {
      throw Error(`project_id = '${project_id}' must be a valid uuid`);
    }
    if (compute_server_id == null) {
      const actions = redux.getProjectActions(project_id);
      if (path != null) {
        compute_server_id =
          actions.getComputeServerIdForFile({ path }) ??
          actions.getComputeServerId();
      } else {
        compute_server_id = actions.getComputeServerId();
      }
    }
    const callProjectApi = async ({ name, args }) => {
      return await this.callProject({
        project_id,
        compute_server_id,
        timeout,
        service: "api",
        name,
        args,
      });
    };
    return initProjectApi(callProjectApi);
  };

  private callProject = async ({
    service = "api",
    project_id,
    compute_server_id,
    name,
    args = [],
    timeout = DEFAULT_TIMEOUT,
  }: {
    service?: string;
    project_id: string;
    compute_server_id?: number;
    name: string;
    args: any[];
    timeout?: number;
  }) => {
    const { cn } = await this.getEnv();
    const subject = projectSubject({ project_id, compute_server_id, service });
    const resp = await cn.request(subject, { name, args }, { timeout });
    return resp.data;
  };

  request = async (subject: string, data: string) => {
    const { nc } = await this.getEnv();
    await waitUntilConnected();
    const resp = await nc.request(subject, this.sc.encode(data));
    return this.sc.decode(resp.data);
  };

  consumer = async (stream: string) => {
    const { nc } = await this.getEnv();
    const js = jetstream.jetstream(nc);
    return await js.consumers.get(stream);
  };

  private getNatsEnv = async () => {
    return {
      sha1,
      jc: this.jc,
      nc: await this.getConnection(),
      cn: this.conat(),
    };
  };

  synctable: NatsSyncTableFunction = async (
    query,
    options?,
  ): Promise<NatsSyncTable> => {
    query = parse_query(query);
    const table = keys(query)[0];
    const obj = options?.obj;
    if (obj != null) {
      for (const k in obj) {
        query[table][0][k] = obj[k];
      }
    }
    if (options?.project_id != null && query[table][0]["project_id"] === null) {
      query[table][0]["project_id"] = options.project_id;
    }
    const s = createSyncTable({
      ...options,
      query,
      env: await this.getEnv(),
      account_id: this.client.account_id,
    });
    await s.init();
    return s;
  };

  // DEPRECATED
  primus = async (project_id: string) => {
    return getPrimusConnection({
      subject: projectSubject({
        project_id,
        compute_server_id: 0,
        service: "primus",
      }),
      env: await this.getEnv(),
      role: "client",
      id: this.sessionId,
    });
  };

  openFiles = reuseInFlight(async (project_id: string) => {
    if (this.openFilesCache[project_id] == null) {
      const openFiles = await createOpenFiles({
        project_id,
      });
      this.openFilesCache[project_id] = openFiles;
      openFiles.on("closed", () => {
        delete this.openFilesCache[project_id];
      });
      openFiles.on("change", (entry) => {
        if (entry.deleted?.deleted) {
          setDeleted({
            project_id,
            path: entry.path,
            deleted: entry.deleted.time,
          });
        } else {
          setNotDeleted({ project_id, path: entry.path });
        }
      });
      const recentlyDeletedPaths: any = {};
      for (const { path, deleted } of openFiles.getAll()) {
        if (deleted?.deleted) {
          recentlyDeletedPaths[path] = deleted.time;
        }
      }
      const store = redux.getProjectStore(project_id);
      store.setState({ recentlyDeletedPaths });
    }
    return this.openFilesCache[project_id]!;
  });

  closeOpenFiles = (project_id) => {
    this.openFilesCache[project_id]?.close();
  };

  pubsub = async ({
    project_id,
    path,
    name,
  }: {
    project_id: string;
    path?: string;
    name: string;
  }) => {
    return new PubSub({ project_id, path, name, env: await this.getEnv() });
  };

  // Evaluate an llm.  This streams the result if stream is given an option,
  // AND it also always returns the result.
  llm = async (opts: ChatOptions): Promise<string> => {
    return await llm({ account_id: this.client.account_id, ...opts });
  };

  stream = async <T = any,>(
    opts: Partial<UserStreamOptions> & { name: string },
  ): Promise<Stream<T>> => {
    if (!opts.account_id && !opts.project_id && opts.limits != null) {
      throw Error("account client can't set limits on public stream");
    }
    return await stream<T>({ env: await this.getEnv(), ...opts });
  };

  dstream = dstream;

  kv = async <T = any,>(
    opts: Partial<KVOptions> & { name: string },
  ): Promise<KV<T>> => {
    //     if (!opts.account_id && !opts.project_id && opts.limits != null) {
    //       throw Error("account client can't set limits on public stream");
    //     }
    return await kv<T>({ env: await this.getEnv(), ...opts });
  };

  dkv = async <T = any,>(
    opts: Partial<DKVOptions> & { name: string },
  ): Promise<DKV<T>> => {
    //     if (!opts.account_id && !opts.project_id && opts.limits != null) {
    //       throw Error("account client can't set limits on public stream");
    //     }
    return await dkv<T>({ env: await this.getEnv(), ...opts });
  };

  dko = async <T = any,>(
    opts: Partial<DKVOptions> & { name: string },
  ): Promise<DKO<T>> => {
    //     if (!opts.account_id && !opts.project_id && opts.limits != null) {
    //       throw Error("account client can't set limits on public stream");
    //     }
    return await dko<T>({ env: await this.getEnv(), ...opts });
  };

  listings = async (opts: {
    project_id: string;
    compute_server_id?: number;
  }) => {
    return await listingsClient(opts);
  };

  computeServerManager = async (options: ComputeServerManagerOptions) => {
    const f = async () => {
      const M = computeServerManager(options);
      await M.init();
      return M;
    };
    try {
      return await f();
    } catch (err) {
      if (err.code == "PERMISSIONS_VIOLATION" && options.project_id) {
        await this.addProjectPermissions([options.project_id]);
        return await f();
      } else {
        throw err;
      }
    }
  };

  getTime = (): number => {
    return getTime();
  };

  getSkew = async (): Promise<number> => {
    return await getSkew();
  };

  inventory = async (location: {
    account_id?: string;
    project_id?: string;
  }) => {
    const inv = await inventory(location);
    // @ts-ignore
    if (console.log_original != null) {
      const ls_orig = inv.ls;
      // @ts-ignore
      inv.ls = (opts) => ls_orig({ ...opts, log: console.log_original });
    }
    return inv;
  };

  info = async (nc): Promise<ConnectionInfo> => {
    // info about a nats connection
    return this.jc.decode(
      (await nc.request("$SYS.REQ.USER.INFO")).data,
    ) as ConnectionInfo;
  };

  isConnected = async () => await isConnected();
  waitUntilConnected = async () => await waitUntilConnected();

  refCacheInfo = () => refCacheInfo();

  tieredStorage = tieredStorage;
}

function setDeleted({ project_id, path, deleted }) {
  if (!redux.hasProjectStore(project_id)) {
    return;
  }
  const actions = redux.getProjectActions(project_id);
  actions.setRecentlyDeleted(path, deleted);
}

function setNotDeleted({ project_id, path }) {
  if (!redux.hasProjectStore(project_id)) {
    return;
  }
  const actions = redux.getProjectActions(project_id);
  actions.setRecentlyDeleted(path, 0);
}
