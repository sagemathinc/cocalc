import * as nats from "nats.ws";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import type { WebappClient } from "./client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { join } from "path";
import { redux } from "../app-framework";
import * as jetstream from "@nats-io/jetstream";
import { createSyncTable, type SyncTable } from "@cocalc/nats/sync/synctable";
import { randomId } from "@cocalc/nats/util";
import { parse_query } from "@cocalc/sync/table/util";
import { sha1 } from "@cocalc/util/misc";
import { keys } from "lodash";
import { type HubApi, initHubApi } from "@cocalc/nats/hub-api";
import { type ProjectApi, initProjectApi } from "@cocalc/nats/project-api";
import { getPrimusConnection } from "@cocalc/nats/primus";

export class NatsClient {
  /*private*/ client: WebappClient;
  private sc = nats.StringCodec();
  private jc = nats.JSONCodec();
  private nc?: Awaited<ReturnType<typeof nats.connect>>;
  public nats = nats;
  public jetstream = jetstream;
  public hub: HubApi;
  public sessionId = randomId();

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

  projectWebsocketApi = async ({ project_id, mesg, timeout = 5000 }) => {
    const nc = await this.getConnection();
    const subject = `project.${project_id}.browser-api`;
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
    timeout,
  }: {
    project_id: string;
    timeout?: number;
  }): ProjectApi => {
    const callProjectApi = async ({ name, args }) => {
      return await this.callProject({
        project_id,
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
    name,
    args = [],
    timeout = 5000,
  }: {
    service?: string;
    project_id: string;
    name: string;
    args: any[];
    timeout?: number;
  }) => {
    const nc = await this.getConnection();
    const subject = `project.${project_id}.${service}`;
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

  request = async (subject: string, data: string) => {
    const c = await this.getConnection();
    const resp = await c.request(subject, this.sc.encode(data));
    return this.sc.decode(resp.data);
  };

  project = async ({
    project_id,
    endpoint,
    params,
  }: {
    project_id: string;
    endpoint: string;
    params?: object;
  }) => {
    const c = await this.getConnection();
    const group = redux.getProjectsStore().get_my_group(project_id);
    if (!group) {
      // todo...?
      throw Error(`group not yet known for '${project_id}'`);
    }
    const subject = `project.${project_id}.api.${group}.${this.client.account_id}`;
    const resp = await c.request(
      subject,
      this.jc.encode({
        endpoint,
        params,
      }),
    );
    const x = this.jc.decode(resp.data) as any;
    if (x?.error) {
      throw Error(x.error);
    }
    return x;
  };

  // for debugging -- listen to and display all messages on a subject
  subscribe = async (subject: string) => {
    const nc = await this.getConnection();
    const sub = nc.subscribe(subject);
    for await (const mesg of sub) {
      console.log(this.jc.decode(mesg.data));
    }
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

  //   createSocket = async (subjects: { listen: string; send: string }) => {
  //     return new Socket({
  //       ...subjects,
  //       nc: await this.getConnection(),
  //       jc: this.jc,
  //     });
  //   };

  primus = async (project_id: string) => {
    return getPrimusConnection({
      subject: `project.${project_id}.primus`,
      env: await this.getEnv(),
      role: "client",
      id: this.sessionId,
    });
  };
}
