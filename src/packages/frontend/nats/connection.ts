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
import { delay } from "awaiting";
import {
  getPermissionsCache,
  type NatsProjectPermissionsCache,
} from "./permissions-cache";
import { isEqual } from "lodash";

const DELAY_UNTIL_DRAIN_PREVIOUS_CONNECTION_MS = 1000 * 60;

function natsWebsocketUrl() {
  return `${location.protocol == "https:" ? "wss" : "ws"}://${location.host}${join(appBasePath, "nats")}`;
}

function connectingMessage({ server, project_ids }) {
  console.log(
    `Connecting to ${server} to use ${JSON.stringify(project_ids)}...`,
  );
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
  const cache = getPermissionsCache();
  const project_ids = cache.get();
  const user = { account_id, project_ids };
  const server = natsWebsocketUrl();
  connectingMessage({ server, project_ids });
  const options = {
    user: JSON.stringify(user),
    name: `account-${account_id}`,
    ...CONNECT_OPTIONS,
    servers: [server],
    inboxPrefix: inboxPrefix({ account_id }),
  };
  const nc = await natsConnect(options);
  cachedConnection = new CoCalcNatsConnection(nc, user, cache);
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
  permissionsCache: NatsProjectPermissionsCache;

  constructor(conn, user, permissionsCache) {
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
    this.permissionsCache = permissionsCache;
  }

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
    this.permissionsCache.add(project_ids);
    await this.updateProjectPermissions();
  };

  // this is debounce since adding permissions tends to come in bursts:
  private updateProjectPermissions = asyncDebounce(
    async () => {
      let project_ids = this.permissionsCache.get();
      if (isEqual(this.user.project_ids, project_ids)) {
        // nothing to do
        return;
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
      connectingMessage({ server, project_ids });
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
      // we wait a while, then drain the previous connection.
      // Since connection usually change rarely, it's fine to wait a while,
      // to minimize disruption.  Make this short as a sort of "bug stress test".
      delayThenDrain(cur, DELAY_UNTIL_DRAIN_PREVIOUS_CONNECTION_MS);
    },
    1000,
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

async function delayThenDrain(conn, time) {
  await delay(time);
  try {
    await conn.drain();
  } catch {}
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
