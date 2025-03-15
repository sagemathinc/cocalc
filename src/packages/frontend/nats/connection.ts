/*
This should work for clients just like a normal NATS connection, but it
also dynamically reconnects to adjust permissions for projects
a browser client may connect to.

This is needed ONLY because:

 - in NATS you can't change the permissions of an existing
   connection when auth is done via auth-callout like we're doing.
   This could become possible in the future, with some change
   to the NATS server. Or maybe I just don't understand it.

 - There is a relatively small limit on the number of permissions for
   one connection, which must be explicitly listed on creation of
   the connection.   However, in CoCalc, a single account can be a
   collaborator on 20,000+ projects, and connect to any one of them
   at any time.


The other option would be to have a separate nats connection for each
project that the browser has open.  This is also viable and probably
simpler.  We basically do that with primus.  The drawbacks:

 - browsers limit the number of websockets for a tab to about 200
 - more connections ==> more load on nats and limits scalability

I generally "feel" like this should be the optimal approach given
all the annoying constraints.  We will likely do something
involving always including recent projects.
*/

// TODO -- size and timeout on auth callout.  Implications?
const MAX_PROJECTS_PER_CONNECTION = 50;
import { redux } from "@cocalc/frontend/app-framework";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { join } from "path";
import type {
  NatsConnection,
  ServerInfo,
  Payload,
  PublishOptions,
  RequestOptions,
  Msg,
  SubscriptionOptions,
  RequestManyOptions,
  Status,
  Stats,
  Subscription,
} from "@nats-io/nats-core";
import { connect as natsConnect } from "nats.ws";
import { inboxPrefix } from "@cocalc/nats/names";
import { CONNECT_OPTIONS } from "@cocalc/util/nats";
import { EventEmitter } from "events";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { asyncDebounce } from "@cocalc/util/async-utils";

function natsWebsocketUrl() {
  return `${location.protocol == "https:" ? "wss" : "ws"}://${location.host}${join(appBasePath, "nats")}`;
}

let cachedConnection: CoCalcNatsConnection | null = null;
export const connect = reuseInFlight(async () => {
  if (cachedConnection != null) {
    return cachedConnection;
  }
  const { account_id } = webapp_client;
  if (!account_id) {
    throw Error("you must be signed in before connecting to NATS");
  }
  const user = { account_id, project_ids: [] };
  const server = natsWebsocketUrl();
  console.log(`NATS: connecting to ${server}...`);
  const options = {
    user: JSON.stringify(user),
    name: `account-${account_id}`,
    ...CONNECT_OPTIONS,
    servers: [server],
    inboxPrefix: inboxPrefix({ account_id }),
  };
  const nc = await natsConnect(options);
  cachedConnection = new CoCalcNatsConnection(nc, user);
  return cachedConnection;
});

// There should be at most one single global instance of CoCalcNatsConnection!  It
// is responsible for managing any connection to nats.  It is assumed that nothing else
// does and that there is only one of these.
class CoCalcNatsConnection extends EventEmitter implements NatsConnection {
  private conn: NatsConnection;

  info?: ServerInfo;
  protocol;
  options;
  user: { account_id: string; project_ids: string[] };
  requested: string[] = [];

  constructor(conn, user) {
    super();
    this.setMaxListeners(500);
    this.conn = conn;
    this.protocol = conn.protocol;
    this.info = conn.info;
    this.options = conn.options;
    this.user = {
      project_ids: uniq(user.project_ids),
      account_id: user.account_id,
    };
  }

  removeProjectPermissions = (project_ids: string[]) => {
    if (project_ids.length == 0 || this.user.project_ids.length == 0) {
      return;
    }
    const x = new Set(this.user.project_ids);
    for (const y of project_ids) {
      x.delete(y);
    }
    if (x.size < this.user.project_ids.length) {
      this.user.project_ids = Array.from(x);
      // we don't actually change the connection -- just make it so the next time
      // it is changed, these project_ids aren't included.
    }
  };

  private removeClosedProjectPermissions = () => {
    if (this.user.project_ids.length == 0) {
      return;
    }
    const v = redux.getStore("projects")?.get("open_projects")?.toJS?.();
    if (v == null) {
      return;
    }
    const openProjects = new Set(v);
    this.removeProjectPermissions(
      this.user.project_ids.filter(
        (project_id) => !openProjects.has(project_id),
      ),
    );
  };

  // gets *actual* projects that this connection has permission to access
  getProjectPermissions = async (): Promise<string[]> => {
    const info = await this.getConnectionInfo();
    const project_ids: string[] = [];
    for (const x of info.data.permissions.publish.allow) {
      if (x.startsWith("project.")) {
        const v = x.split(".");
        project_ids.push(v[1]);
      }
    }
    return project_ids;
  };

  getConnectionInfo = async () => {
    return await webapp_client.nats_client.info(this.conn);
  };

  addProjectPermissions = async (project_ids: string[]) => {
    if (project_ids.length == 0) {
      return;
    }
    // always first remove any for closed projects, since we never need to talk to them
    this.removeClosedProjectPermissions();

    // adding anything?
    const x = new Set(this.user.project_ids);
    for (const y of project_ids) {
      x.add(y);
    }
    if (x.size > this.user.project_ids.length) {
      project_ids = Array.from(x);
      await this.setProjectPermissions(project_ids);
    }
  };

  private setProjectPermissions = async (project_ids: string[]) => {
    this.requested.push(...project_ids);
    await this.updateProjectPermissions();
  };

  // this is debounce since adding permissions tends to come in bursts:
  private updateProjectPermissions = asyncDebounce(
    async () => {
      if (this.requested.length == 0) {
        return;
      }
      let project_ids = Array.from(new Set(this.requested));
      this.requested = [];

      if (project_ids.length > MAX_PROJECTS_PER_CONNECTION) {
        console.warn(
          `WARNING: there is a limit of at most ${MAX_PROJECTS_PER_CONNECTION} project permissions at once`,
        );
        // take most recently requested:
        project_ids = project_ids.slice(-MAX_PROJECTS_PER_CONNECTION);
      }

      const { account_id } = webapp_client;
      if (!account_id) {
        throw Error("you must be signed in before connecting to NATS");
      }
      const user = {
        account_id,
        project_ids,
      };
      const server = natsWebsocketUrl();
      console.log(
        `NATS: connecting to ${server} to use ${project_ids.join(",")}...`,
      );
      const options = {
        user: JSON.stringify(user),
        name: `account-${account_id}`,
        ...CONNECT_OPTIONS,
        servers: [server],
        inboxPrefix: inboxPrefix({ account_id }),
      };
      const cur = this.conn;
      const conn = (await natsConnect(options)) as any;
      this.conn = conn;
      this.protocol = conn.protocol;
      this.info = conn.info;
      this.options = options;
      this.user = user;
      // tell clients they should reconnect, since the connection they
      // had used is going to drain soon.
      this.emit("reconnect");
      setTimeout(async () => {
        // we wait a minute, then drain the previous connection.
        try {
          await cur.drain();
        } catch {}
      }, 60000);
    },
    750,
    { leading: true, trailing: true },
  );

  async closed(): Promise<void | Error> {
    return await this.conn.closed();
  }

  async close(): Promise<void> {
    await this.conn.close();
  }

  publish(subject: string, payload?: Payload, options?: PublishOptions): void {
    this.conn.publish(subject, payload, options);
  }

  publishMessage(msg: Msg): void {
    this.conn.publishMessage(msg);
  }

  respondMessage(msg: Msg): boolean {
    return this.conn.respondMessage(msg);
  }

  subscribe(subject: string, opts?: SubscriptionOptions): Subscription {
    return this.conn.subscribe(subject, opts);
  }

  async request(
    subject: string,
    payload?: Payload,
    opts?: RequestOptions,
  ): Promise<Msg> {
    return await this.conn.request(subject, payload, opts);
  }

  async requestMany(
    subject: string,
    payload?: Payload,
    opts?: Partial<RequestManyOptions>,
  ): Promise<AsyncIterable<Msg>> {
    return await this.conn.requestMany(subject, payload, opts);
  }

  async flush(): Promise<void> {
    this.conn.flush();
  }

  async drain(): Promise<void> {
    this.conn.drain();
  }

  isClosed(): boolean {
    return this.conn.isClosed();
  }

  isDraining(): boolean {
    return this.conn.isDraining();
  }

  getServer(): string {
    return this.conn.getServer();
  }

  status(): AsyncIterable<Status> {
    return this.conn.status();
  }

  stats(): Stats {
    return this.conn.stats();
  }

  async rtt(): Promise<number> {
    return await this.conn.rtt();
  }

  async reconnect(): Promise<void> {
    await this.conn.reconnect();
  }

  get features() {
    return this.protocol.features;
  }

  getServerVersion(): SemVer | undefined {
    const info = this.info;
    return info ? parseSemVer(info.version) : undefined;
  }
}

export { type CoCalcNatsConnection };

export type SemVer = { major: number; minor: number; micro: number };
export function parseSemVer(s = ""): SemVer {
  const m = s.match(/(\d+).(\d+).(\d+)/);
  if (m) {
    return {
      major: parseInt(m[1]),
      minor: parseInt(m[2]),
      micro: parseInt(m[3]),
    };
  }
  throw new Error(`'${s}' is not a semver value`);
}

function uniq(v: string[]): string[] {
  return Array.from(new Set(v));
}
