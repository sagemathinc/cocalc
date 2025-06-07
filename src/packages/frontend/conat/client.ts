import { redux } from "@cocalc/frontend/app-framework";
import type { WebappClient } from "@cocalc/frontend/client/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import {
  type ConatSyncTable,
  ConatSyncTableFunction,
} from "@cocalc/conat/sync/synctable";
import { randomId, inboxPrefix } from "@cocalc/conat/names";
import { projectSubject } from "@cocalc/conat/names";
import { parse_query } from "@cocalc/sync/table/util";
import { keys } from "lodash";
import { type HubApi, initHubApi } from "@cocalc/conat/hub/api";
import { type ProjectApi, initProjectApi } from "@cocalc/conat/project/api";
import { isValidUUID } from "@cocalc/util/misc";
import { createOpenFiles, OpenFiles } from "@cocalc/conat/sync/open-files";
import { PubSub } from "@cocalc/conat/sync/pubsub";
import type { ChatOptions } from "@cocalc/util/types/llm";
import { dkv } from "@cocalc/conat/sync/dkv";
import { akv } from "@cocalc/conat/sync/akv";
import { astream } from "@cocalc/conat/sync/astream";
import { dko } from "@cocalc/conat/sync/dko";
import { dstream } from "@cocalc/conat/sync/dstream";
import { callConatService, createConatService } from "@cocalc/conat/service";
import type {
  CallConatServiceFunction,
  CreateConatServiceFunction,
} from "@cocalc/conat/service";
import { listingsClient } from "@cocalc/conat/service/listings";
import getTime, { getSkew, init as initTime } from "@cocalc/conat/time";
import { llm } from "@cocalc/conat/llm/client";
import { inventory } from "@cocalc/conat/sync/inventory";
import { EventEmitter } from "events";
import {
  getClient as getClientWithState,
  setConatClient,
  type ClientWithState,
} from "@cocalc/conat/client";
import Cookies from "js-cookie";
import { ACCOUNT_ID_COOKIE } from "@cocalc/frontend/client/client";
import { info as refCacheInfo } from "@cocalc/util/refcache";
import { connect as connectToConat } from "@cocalc/conat/core/client";
import type { ConnectionStats } from "@cocalc/conat/core/types";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { once } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
import {
  deleteRememberMe,
  setRememberMe,
} from "@cocalc/frontend/misc/remember-me";

export interface ConatConnectionStatus {
  state: "connected" | "disconnected";
  reason: string;
  details: any;
  stats: ConnectionStats;
}

const DEFAULT_TIMEOUT = 15000;

declare var DEBUG: boolean;

export class ConatClient extends EventEmitter {
  client: WebappClient;
  public hub: HubApi;
  public sessionId = randomId();
  private openFilesCache: { [project_id: string]: OpenFiles } = {};
  private clientWithState: ClientWithState;
  private _conatClient: null | ReturnType<typeof connectToConat>;
  public numConnectionAttempts = 0;

  constructor(client: WebappClient) {
    super();
    this.setMaxListeners(100);
    this.client = client;
    this.hub = initHubApi(this.callHub);
    this.initConatClient();
    this.on("state", (state) => {
      this.emit(state);
    });
  }

  private setConnectionStatus = (status: Partial<ConatConnectionStatus>) => {
    const actions = redux?.getActions("page");
    const store = redux?.getStore("page");
    if (actions == null || store == null) {
      return;
    }
    const cur = store.get("conat")?.toJS();
    actions.setState({ conat: { ...cur, ...status } } as any);
  };

  conat = () => {
    if (this._conatClient == null) {
      this.startStatsReporter();
      this._conatClient = connectToConat({
        address: location.origin + appBasePath,
        inboxPrefix: inboxPrefix({ account_id: this.client.account_id }),
      });
      this._conatClient.on("connected", () => {
        this.setConnectionStatus({
          state: "connected",
          reason: "",
          details: "",
          stats: this._conatClient?.stats,
        });
        this.client.emit("connected");
      });
      this._conatClient.on("disconnected", (reason, details) => {
        this.setConnectionStatus({
          state: "disconnected",
          reason,
          details,
          stats: this._conatClient?.stats,
        });
        this.client.emit("disconnected", "offline");
      });
      this._conatClient.conn.io.on("reconnect_attempt", (attempt) => {
        this.numConnectionAttempts = attempt;
        this.client.emit("connecting");
      });
    }
    return this._conatClient!;
  };

  private permanentlyDisconnected = false;
  permanentlyDisconnect = () => {
    this.permanentlyDisconnected = true;
    this.standby();
  };

  is_signed_in = (): boolean => {
    return !!this._conatClient?.info?.user?.account_id;
  };

  is_connected = (): boolean => {
    return !!this._conatClient?.conn?.connected;
  };

  private startStatsReporter = async () => {
    while (true) {
      if (this._conatClient != null) {
        this.setConnectionStatus({ stats: this._conatClient?.stats });
      }
      await delay(5000);
    }
  };

  private initConatClient = async () => {
    setConatClient({
      account_id: this.client.account_id,
      conat: async () => this.conat(),
      reconnect: async () => this.reconnect(),
      getLogger:
        false && DEBUG
          ? (name) => {
              return {
                info: (...args) => console.info(name, ...args),
                debug: (...args) => console.log(name, ...args),
                warn: (...args) => console.warn(name, ...args),
                silly: (...args) => console.log(name, ...args),
              };
            }
          : undefined,
    });
    this.clientWithState = getClientWithState();
    this.clientWithState.on("state", (state) => {
      if (state != "closed") {
        this.emit(state);
      }
    });
    initTime();
    const client = this.conat();
    if (!client.info) {
      await once(client.conn as any, "info");
    }
    if (client.info?.user?.account_id) {
      console.log("Connected as ", JSON.stringify(client.info?.user));
      this.signedIn({
        account_id: client.info.user.account_id,
        hub: client.info.id,
      });
      const cookie = Cookies.get(ACCOUNT_ID_COOKIE);
      if (cookie && cookie != client.info.user.account_id) {
        // make sure account_id cookie is set to the actual account we're
        // signed in as, then refresh since some things are going to be
        // broken otherwise. To test this use dev tools and just change the account_id
        // cookies value to something random.
        Cookies.set(ACCOUNT_ID_COOKIE, client.info.user.account_id);
        // and we're out of here:
        location.reload();
      }
    } else {
      console.log("Sign in failed -- ", client.info);
      this.signInFailed(client.info?.user?.error ?? "Failed to sign in.");
    }
  };

  public signedInMessage?: { account_id: string; hub: string };
  private signedIn = (mesg: { account_id: string; hub: string }) => {
    this.signedInMessage = mesg;
    this.client.account_id = mesg.account_id;
    setRememberMe(appBasePath);
    this.client.emit("signed_in", mesg);
  };

  private signInFailed = (error) => {
    deleteRememberMe(appBasePath);
    this.client.emit("remember_me_failed", { error });
  };

  reconnect = () => {
    this._conatClient?.conn.io.engine.close();
    this.resume();
  };

  // if there is a connection, put it in standby
  standby = () => {
    // @ts-ignore
    this._conatClient?.conn.io.disconnect();
  };

  // if there is a connection, resume it
  resume = () => {
    if (this.permanentlyDisconnected) {
      console.log(
        "Not connecting -- client is permanently disconnected and must refresh their browser",
      );
      return;
    }
    this._conatClient?.conn.io.connect();
  };

  callConatService: CallConatServiceFunction = async (options) => {
    return await callConatService(options);
  };

  createConatService: CreateConatServiceFunction = (options) => {
    return createConatService(options);
  };

  // TODO: plan to deprecated...?
  projectWebsocketApi = async ({
    project_id,
    compute_server_id,
    mesg,
    timeout = DEFAULT_TIMEOUT,
  }) => {
    const cn = this.conat();
    const subject = projectSubject({
      project_id,
      compute_server_id,
      service: "browser-api",
    });
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
    const cn = this.conat();
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
    const cn = this.conat();
    const subject = projectSubject({ project_id, compute_server_id, service });
    const resp = await cn.request(subject, { name, args }, { timeout });
    return resp.data;
  };

  synctable: ConatSyncTableFunction = async (
    query,
    options?,
  ): Promise<ConatSyncTable> => {
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
    return await this.conat().sync.synctable({
      ...options,
      query,
      account_id: this.client.account_id,
    });
  };

  primus = ({
    project_id,
    compute_server_id = 0,
    channel,
  }: {
    project_id: string;
    compute_server_id?: number;
    channel?: string;
  }) => {
    let subject = projectSubject({
      project_id,
      compute_server_id,
      service: "primus",
    });
    if (channel) {
      subject += "." + channel;
    }
    return this.conat().socket.connect(subject);
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
    return new PubSub({ client: this.conat(), project_id, path, name });
  };

  // Evaluate an llm.  This streams the result if stream is given an option,
  // AND it also always returns the result.
  llm = async (opts: ChatOptions): Promise<string> => {
    return await llm({ account_id: this.client.account_id, ...opts });
  };

  dstream = dstream;
  astream = astream;
  dkv = dkv;
  akv = akv;
  dko = dko;

  listings = async (opts: {
    project_id: string;
    compute_server_id?: number;
  }) => {
    return await listingsClient(opts);
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

  refCacheInfo = () => refCacheInfo();
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
  actions?.setRecentlyDeleted(path, 0);
}
