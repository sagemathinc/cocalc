import * as nats from "nats.ws";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import type { WebappClient } from "@cocalc/frontend/client/client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { join } from "path";
import * as jetstream from "@nats-io/jetstream";
import { createSyncTable, type SyncTable } from "@cocalc/nats/sync/synctable";
import { randomId } from "@cocalc/nats/names";
import { browserSubject, projectSubject } from "@cocalc/nats/names";
import { parse_query } from "@cocalc/sync/table/util";
import { sha1 } from "@cocalc/util/misc";
import { keys } from "lodash";
import { type HubApi, initHubApi } from "@cocalc/nats/hub-api";
import { type ProjectApi, initProjectApi } from "@cocalc/nats/project-api";
import { type BrowserApi, initBrowserApi } from "@cocalc/nats/browser-api";
import { getPrimusConnection } from "@cocalc/nats/primus";
import { isValidUUID } from "@cocalc/util/misc";
import { createOpenFiles, OpenFiles } from "@cocalc/nats/sync/open-files";
import { PubSub } from "@cocalc/nats/sync/pubsub";
import type { ChatOptions } from "@cocalc/util/types/llm";
import { kv, type KVOptions } from "@cocalc/nats/sync/kv";
import { dkv, type DKVOptions } from "@cocalc/nats/sync/dkv";
import { dko, type DKOOptions } from "@cocalc/nats/sync/dko";
import { stream, type UserStreamOptions } from "@cocalc/nats/sync/stream";
import { dstream } from "@cocalc/nats/sync/dstream";
import { initApi } from "@cocalc/frontend/nats/api";
import { delay } from "awaiting";
import { Svcm } from "@nats-io/services";
import { CONNECT_OPTIONS } from "@cocalc/util/nats";

export class NatsClient {
  client: WebappClient;
  private sc = nats.StringCodec();
  private jc = nats.JSONCodec();
  private nc?: Awaited<ReturnType<typeof nats.connect>>;
  public nats = nats;
  public jetstream = jetstream;
  public hub: HubApi;
  public sessionId = randomId();
  private openFilesCache: { [project_id: string]: OpenFiles } = {};

  constructor(client: WebappClient) {
    this.client = client;
    this.hub = initHubApi(this.callHub);
    this.initBrowserApi();
  }

  private initBrowserApi = async () => {
    // have to delay so that this.client is fully created.
    await delay(1);
    try {
      await initApi();
    } catch (err) {
      console.warn("ERROR -- failed to initialize browser api", err);
    }
  };

  getConnection = reuseInFlight(async () => {
    if (this.nc != null) {
      // undocumented API
      if ((this.nc as any).protocol?.isClosed?.()) {
        // cause a reconnect.
        delete this.nc;
      } else {
        return this.nc;
      }
    }
    const server = `${location.protocol == "https:" ? "wss" : "ws"}://${location.host}${appBasePath}/nats`;
    console.log(`NATS: connecting to ${server}...`);
    const options = {
      ...CONNECT_OPTIONS,
      servers: [server],
    };
    try {
      this.nc = await nats.connect(options);
    } catch (err) {
      console.log("NATS: set the JWT cookie and try again");
      await fetch(join(appBasePath, "nats"));
      this.nc = await nats.connect(options);
    }
    console.log(`NATS: connected to ${server}`);
    return this.nc;
  });

  // deprecated!
  projectWebsocketApi = async ({ project_id, mesg, timeout = 5000 }) => {
    const nc = await this.getConnection();
    const subject = `${projectSubject({ project_id })}.browser-api`;
    const resp = await nc.request(subject, this.jc.encode(mesg), {
      timeout,
    });
    return this.jc.decode(resp.data);
  };

  private callHub = async ({
    service = "api",
    name,
    args = [],
    timeout = 5000,
  }: {
    service?: string;
    name: string;
    args: any[];
    timeout?: number;
  }) => {
    const nc = await this.getConnection();
    const subject = `hub.account.${this.client.account_id}.${service}`;
    try {
      const resp = await nc.request(
        subject,
        this.jc.encode({
          name,
          args,
        }),
        { timeout },
      );
      return this.jc.decode(resp.data);
    } catch (err) {
      err.message = `${err.message} - callHub: subject='${subject}', name='${name}', `;
      throw err;
    }
  };

  // Returns api for RPC calls to the project with typescript support!
  projectApi = ({
    project_id,
    compute_server_id = 0,
    timeout,
  }: {
    project_id: string;
    compute_server_id?: number;
    timeout?: number;
  }): ProjectApi => {
    if (!isValidUUID(project_id)) {
      throw Error(`project_id = '${project_id}' must be a valid uuid`);
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
    timeout = 5000,
  }: {
    service?: string;
    project_id: string;
    compute_server_id: number;
    name: string;
    args: any[];
    timeout?: number;
  }) => {
    const nc = await this.getConnection();
    const subject = `${projectSubject({ project_id, compute_server_id })}.${service}`;
    const mesg = this.jc.encode({
      name,
      args,
    });
    let resp;
    try {
      resp = await nc.request(subject, mesg, { timeout });
    } catch (err) {
      if (err.code == "PERMISSIONS_VIOLATION") {
        // request update of our credentials to include this project, then try again
        await this.hub.projects.addProjectPermission({ project_id });
        resp = await nc.request(subject, mesg, { timeout });
      } else {
        throw err;
      }
    }
    return this.jc.decode(resp.data);
  };

  private callBrowser = async ({
    service = "api",
    sessionId,
    name,
    args = [],
    timeout = 5000,
  }: {
    service?: string;
    sessionId: string;
    name: string;
    args: any[];
    timeout?: number;
  }) => {
    const nc = await this.getConnection();
    const subject = browserSubject({
      account_id: this.client.account_id,
      sessionId,
      service,
    });
    const mesg = this.jc.encode({
      name,
      args,
    });
    // console.log("request to subject", { subject, name, args });
    const resp = await nc.request(subject, mesg, { timeout });
    return this.jc.decode(resp.data);
  };

  browserApi = ({
    sessionId,
    timeout,
  }: {
    sessionId: string;
    timeout?: number;
  }): BrowserApi => {
    const callBrowserApi = async ({ name, args }) => {
      return await this.callBrowser({
        sessionId,
        timeout,
        service: "api",
        name,
        args,
      });
    };
    return initBrowserApi(callBrowserApi);
  };

  request = async (subject: string, data: string) => {
    const c = await this.getConnection();
    const resp = await c.request(subject, this.sc.encode(data));
    return this.sc.decode(resp.data);
  };

  consumer = async (stream: string) => {
    const js = jetstream.jetstream(await this.getConnection());
    return await js.consumers.get(stream);
  };

  getEnv = async () => {
    return {
      sha1,
      jc: this.jc,
      nc: await this.getConnection(),
    };
  };

  private synctableCache: { [key: string]: SyncTable } = {};
  synctable = reuseInFlight(
    async (
      query,
      options?: {
        obj?: object;
        atomic?: boolean;
        immutable?: boolean;
        stream?: boolean;
        pubsub?: boolean;
        throttleChanges?: number;
        // for tables specific to a project, e.g., syncstrings in a project
        project_id?: string;
      },
    ): Promise<SyncTable> => {
      query = parse_query(query);
      const key = JSON.stringify({ query, options });
      if (this.synctableCache[key] != null) {
        return this.synctableCache[key];
      }
      const table = keys(query)[0];
      const obj = options?.obj;
      if (obj != null) {
        for (const k in obj) {
          query[table][0][k] = obj[k];
        }
      }
      if (
        options?.project_id != null &&
        query[table][0]["project_id"] === null
      ) {
        query[table][0]["project_id"] = options.project_id;
      }
      const s = createSyncTable({
        ...options,
        query,
        env: await this.getEnv(),
        account_id: this.client.account_id,
      });
      this.synctableCache[key] = s;
      // @ts-ignore
      s.on("closed", () => {
        delete this.synctableCache[key];
      });
      await s.init();
      return s;
    },
  );

  changefeedInterest = async (query, noError?: boolean) => {
    // express interest
    // (re-)start changefeed going
    try {
      await this.client.nats_client.callHub({
        service: "db",
        name: "userQuery",
        args: [{ changes: true, query }],
      });
    } catch (err) {
      if (noError) {
        console.warn("changefeedInterest -- error", query);
        console.warn(err);
        return;
      } else {
        throw err;
      }
    }
  };

  changefeed = async (query, options?) => {
    this.changefeedInterest(query, true);
    return await this.synctable(query, options);
  };

  // DEPRECATED
  primus = async (project_id: string) => {
    return getPrimusConnection({
      subject: `${projectSubject({ project_id, compute_server_id: 0 })}.primus`,
      env: await this.getEnv(),
      role: "client",
      id: this.sessionId,
    });
  };

  openFiles = reuseInFlight(async (project_id: string) => {
    if (this.openFilesCache[project_id] == null) {
      this.openFilesCache[project_id] = await createOpenFiles({
        project_id,
        env: await this.getEnv(),
      });
      this.openFilesCache[project_id].on("closed", () => {
        delete this.openFilesCache[project_id];
      });
    }
    return this.openFilesCache[project_id]!;
  });

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

  // Evaluate the llm.  This streams the result if stream is given an option,
  // AND it also always returns the result.
  llm = async (opts: ChatOptions) => {
    const { stream, ...options } = opts;
    const { subject, streamName } = await this.hub.llm.evaluate(options);
    // making an ephemeral consumer
    const nc = await this.getConnection();
    const js = jetstream.jetstream(nc);
    const jsm = await jetstream.jetstreamManager(nc);
    const { name } = await jsm.consumers.add(streamName, {
      filter_subject: subject,
    });
    const consumer = await js.consumers.get(streamName, name);
    const messages = await consumer.fetch();
    const decoder = new TextDecoder("utf-8");
    let accumulate = "";
    for await (const mesg of messages) {
      if (mesg.data.length == 0) {
        // done.
        stream?.(undefined); // indicates done
        messages.stop();
        break;
      }
      const text = decoder.decode(mesg.data);
      accumulate += text;
      stream?.(text);
    }
    return accumulate;
  };

  stream = async (opts: Partial<UserStreamOptions>) => {
    if (!opts.account_id && !opts.project_id && opts.limits != null) {
      throw Error("account client can't set limits on public stream");
    }
    return await stream({ env: await this.getEnv(), ...opts });
  };

  dstream = async (opts: Partial<UserStreamOptions>) => {
    if (!opts.account_id && !opts.project_id && opts.limits != null) {
      throw Error("account client can't set limits on public stream");
    }
    return await dstream({ env: await this.getEnv(), ...opts });
  };

  kv = async (opts: Partial<KVOptions>) => {
    //     if (!opts.account_id && !opts.project_id && opts.limits != null) {
    //       throw Error("account client can't set limits on public stream");
    //     }
    return await kv({ env: await this.getEnv(), ...opts });
  };

  dkv = async (opts: Partial<DKVOptions>) => {
    //     if (!opts.account_id && !opts.project_id && opts.limits != null) {
    //       throw Error("account client can't set limits on public stream");
    //     }
    return await dkv({ env: await this.getEnv(), ...opts });
  };

  dko = async (opts: Partial<DKOOptions>) => {
    //     if (!opts.account_id && !opts.project_id && opts.limits != null) {
    //       throw Error("account client can't set limits on public stream");
    //     }
    return await dko({ env: await this.getEnv(), ...opts });
  };

  microservicesClient = async () => {
    const nc = await this.getConnection();
    // @ts-ignore
    const svcm = new Svcm(nc);
    return svcm.client();
  };
}
