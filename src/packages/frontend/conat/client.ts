import { redux } from "@cocalc/frontend/app-framework";
import type { WebappClient } from "@cocalc/frontend/client/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import {
  type ConatSyncTable,
  ConatSyncTableFunction,
} from "@cocalc/conat/sync/synctable";
import { randomId, inboxPrefix } from "@cocalc/conat/names";
import { projectSubject } from "@cocalc/conat/names";
import { parseQueryWithOptions } from "@cocalc/sync/table/util";
import { type HubApi, initHubApi } from "@cocalc/conat/hub/api";
import { type ProjectApi, projectApiClient } from "@cocalc/conat/project/api";
import { isValidUUID } from "@cocalc/util/misc";
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
import * as acp from "@cocalc/conat/ai/acp/client";
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
import { until } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
import {
  deleteRememberMe,
  setRememberMe,
} from "@cocalc/frontend/misc/remember-me";
import { client as projectRunnerClient } from "@cocalc/conat/project/runner/run";
import { get as getBootlog } from "@cocalc/conat/project/runner/bootlog";
import { terminalClient } from "@cocalc/conat/project/terminal";
import { lite } from "@cocalc/frontend/lite";

export interface ConatConnectionStatus {
  state: "connected" | "disconnected";
  reason: string;
  details: any;
  stats: ConnectionStats;
}

const DEFAULT_TIMEOUT = 15000;

const DEBUG = false;

export class ConatClient extends EventEmitter {
  client: WebappClient;
  public hub: HubApi;
  public sessionId = randomId();
  private clientWithState: ClientWithState;
  private _conatClient: null | ReturnType<typeof connectToConat>;
  public numConnectionAttempts = 0;
  private automaticallyReconnect;
  public address: string;
  private remote: boolean;

  constructor(
    client: WebappClient,
    { address, remote }: { address?: string; remote?: boolean } = {},
  ) {
    super();
    this.address = address ?? location.origin + appBasePath;
    this.remote = !!remote;
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
        address: this.address,
        inboxPrefix: inboxPrefix({ account_id: this.client.account_id }),
        // it is necessary to manually managed reconnects due to a bugs
        // in socketio that has stumped their devs
        //   -- https://github.com/socketio/socket.io/issues/5197
        reconnection: false,
      });
      this._conatClient.on("connected", () => {
        this.setConnectionStatus({
          state: "connected",
          reason: "",
          details: "",
          stats: this._conatClient?.stats,
        });
        this.client.emit("connected");
        this.automaticallyReconnect = true;
      });
      this._conatClient.on("disconnected", (reason, details) => {
        this.setConnectionStatus({
          state: "disconnected",
          reason,
          details,
          stats: this._conatClient?.stats,
        });
        this.client.emit("disconnected", "offline");
        if (this.automaticallyReconnect) {
          setTimeout(this.connect, 1000);
        }
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
    if (!this.remote) {
      // only initialize if not making a remote connection, since this is
      // the default connection to our local server
      setConatClient({
        account_id: this.client.account_id,
        conat: this.conat,
        reconnect: async () => this.reconnect(),
        getLogger: DEBUG
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
    }
    this.clientWithState = getClientWithState();
    this.clientWithState.on("state", (state) => {
      if (state != "closed") {
        this.emit(state);
      }
    });
    initTime();
    const client = this.conat();
    client.inboxPrefixHook = (info) => {
      return info?.user ? inboxPrefix(info?.user) : undefined;
    };

    client.on("info", (info) => {
      if (client.info?.user?.account_id) {
        console.log("Connected as ", JSON.stringify(client.info?.user));
        this.signedIn({
          account_id: info.user.account_id,
          hub: info.id ?? "",
        });
        const cookie = Cookies.get(ACCOUNT_ID_COOKIE);
        if (!lite && cookie && cookie != client.info.user.account_id) {
          // make sure account_id cookie is set to the actual account we're
          // signed in as, then refresh since some things are going to be
          // broken otherwise. To test this use dev tools and just change the account_id
          // cookies value to something random.
          Cookies.set(ACCOUNT_ID_COOKIE, client.info.user.account_id);
          // and we're out of here:
          const wait = 5000;
          console.log(`COOKIE ISSUE -- RELOAD IN ${wait / 1000} SECONDS...`, {
            cookie,
          });
          setTimeout(() => {
            if (lite) {
              return;
            }
            location.reload();
          }, 5000);
        }
      } else if (lite && client.info?.user?.project_id) {
        // we *also* sign in as the PROJECT in lite mode.
        console.log("lite: created project client");
      } else {
        console.log("Sign in failed -- ", client.info);
        this.signInFailed(client.info?.user?.error ?? "Failed to sign in.");
        this.client.alert_message({
          type: "error",
          message: "You must sign in.",
          block: true,
        });
        this.standby();
      }
    });
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
    this.automaticallyReconnect = false;
    this._conatClient?.disconnect();
  };

  // if there is a connection, resume it
  resume = () => {
    this.connect();
    // sometimes due to a race (?) the above connect fails or
    // is disconnected immedaitely. So we call connect more times,
    // which are no-ops once connected.
    for (const delay of [3_500, 10_000, 20_000]) {
      setTimeout(() => {
        this.connect();
      }, delay);
    }
  };

  // keep trying until connected.
  connect = reuseInFlight(async () => {
    let attempts = 0;
    await until(
      async () => {
        if (this.permanentlyDisconnected) {
          console.log(
            "Not connecting -- client is permanently disconnected and must refresh their browser",
          );
          return true;
        }
        if (this._conatClient == null) {
          this.conat();
        }
        if (this._conatClient?.conn?.connected) {
          return true;
        }
        this._conatClient?.disconnect();
        await delay(750);
        await waitForOnline();
        attempts += 1;
        console.log(`Connecting to ${this.address}: attempts ${attempts}`);
        this._conatClient?.connect();
        return false;
      },
      { min: 3000, max: 15000 },
    );
  });

  callConatService: CallConatServiceFunction = async (options) => {
    return await callConatService(options);
  };

  createConatService: CreateConatServiceFunction = (options) => {
    return createConatService(options);
  };

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
      waitForInterest: true,
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
      try {
        err.message = `${err.message} - callHub: subject='${subject}', name='${name}', code='${err.code}'`;
      } catch {
        err = new Error(
          `${err.message} - callHub: subject='${subject}', name='${name}', code='${err.code}'`,
        );
      }
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
          actions.getComputeServerIdForFile(path) ??
          actions.getComputeServerId();
      } else {
        compute_server_id = actions.getComputeServerId();
      }
    }
    return projectApiClient({ project_id, compute_server_id, timeout });
  };

  synctable: ConatSyncTableFunction = async (
    query0,
    options?,
  ): Promise<ConatSyncTable> => {
    const { query } = parseQueryWithOptions(query0, options);
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
    return this.conat().socket.connect(subject, {
      desc: `primus-${channel ?? ""}`,
    });
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

  streamAcp = async (request, options?) => {
    return await acp.streamAcp(
      { account_id: this.client.account_id, ...request },
      options,
      this.conat(),
    );
  };

  runAcp = async (request, options?) => {
    return await acp.runAcp(
      { account_id: this.client.account_id, ...request },
      options,
      this.conat(),
    );
  };

  respondAcpApproval = async (request) => {
    await acp.respondAcpApproval(
      { account_id: this.client.account_id, ...request },
      this.conat(),
    );
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

  projectRunner = (
    project_id: string,
    { timeout = 30 * 1000 * 60 }: { timeout?: number } = {},
  ) => {
    return projectRunnerClient({
      project_id,
      client: this.conat(),
      timeout,
    });
  };

  projectBootlog = (opts: {
    project_id: string;
    compute_server_id?: number;
  }) => {
    return getBootlog({ ...opts, client: this.conat() });
  };

  terminalClient = (opts: {
    project_id: string;
    compute_server_id?: number;
    getSize?: () => undefined | { rows: number; cols: number };
  }) => {
    return terminalClient({
      client: this.conat(),
      ...opts,
    });
  };
}

async function waitForOnline(): Promise<void> {
  if (navigator.onLine) return;
  await new Promise<void>((resolve) => {
    const handler = () => {
      window.removeEventListener("online", handler);
      resolve();
    };
    window.addEventListener("online", handler);
  });
}
