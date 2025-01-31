import * as nats from "nats.ws";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import type { WebappClient } from "./client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { join } from "path";
import * as jetstream from "@nats-io/jetstream";
import { createSyncTable, type SyncTable } from "@cocalc/nats/sync/synctable";
import { randomId } from "@cocalc/nats/names";
import { projectSubject } from "@cocalc/nats/names";
import { parse_query } from "@cocalc/sync/table/util";
import { sha1 } from "@cocalc/util/misc";
import { keys } from "lodash";
import { type HubApi, initHubApi } from "@cocalc/nats/hub-api";
import { type ProjectApi, initProjectApi } from "@cocalc/nats/project-api";
import { getPrimusConnection } from "@cocalc/nats/primus";
import { isValidUUID } from "@cocalc/util/misc";
import { OpenFiles } from "@cocalc/nats/sync/open-files";

export class NatsClient {
  /*private*/ client: WebappClient;
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
  }

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
    try {
      this.nc = await nats.connect({
        servers: [server],
        // this pingInterval determines how long from when the browser's network connection dies
        // and comes back, until nats starts working again.
        pingInterval: 10000,
      });
    } catch (err) {
      console.log("NATS: set the JWT cookie and try again");
      await fetch(join(appBasePath, "nats"));
      this.nc = await nats.connect({
        servers: [server],
      });
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
    const resp = await nc.request(
      subject,
      this.jc.encode({
        name,
        args,
      }),
      { timeout },
    );
    return this.jc.decode(resp.data);
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
        await this.hub.system.addProjectPermission({ project_id });
        resp = await nc.request(subject, mesg, { timeout });
      } else {
        throw err;
      }
    }
    return this.jc.decode(resp.data);
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

  synctable = async (
    query,
    options?: { obj?: object; atomic?: boolean; stream?: boolean },
  ): Promise<SyncTable> => {
    query = parse_query(query);
    const obj = options?.obj;
    if (obj != null) {
      const table = keys(query)[0];
      for (const k in obj) {
        query[table][0][k] = obj[k];
      }
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
        console.warn(err);
        return;
      } else {
        throw err;
      }
    }
  };

  changefeed = async (query) => {
    this.changefeedInterest(query, true);
    return await this.synctable(query, { atomic: true });
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
      this.openFilesCache[project_id] = new OpenFiles({
        project_id,
        env: await this.getEnv(),
      });
    }
    return this.openFilesCache[project_id]!;
  });
}
