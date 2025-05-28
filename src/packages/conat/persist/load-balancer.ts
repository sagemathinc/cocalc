/*
INPUTS:

- receive registration requests from all persist servers periodically
- answer requests about which persist server to use for a given stream.
- saves state on disk using sqlite so when restarted the assignments don't change.
- when a persist server stops responding promptly, when request for stream on
  it comes in, that stream is re-assigned.

*/

import {
  type Client,
  connect,
  type Subscription,
} from "@cocalc/conat/core/client";
import { type Storage } from "./client";
import { SUBJECT, User, getUserId } from "./server";
import {
  createDatabase,
  type Database,
  ensureContainingDirectoryExists,
} from "./context";
import TTL from "@isaacs/ttlcache";
import jsonStableStringify from "json-stable-stringify";
import { field_cmp } from "@cocalc/util/misc";

export function loadBalancerSubject({ account_id, project_id }: User) {
  if (account_id) {
    return `${SUBJECT}.account-${account_id}.lb`;
  } else if (project_id) {
    return `${SUBJECT}.project-${project_id}.lb`;
  } else {
    return `${SUBJECT}.hub.lb`;
  }
}

interface LoadBalancerApi {
  // persist servers call this to register periodically. If no registration for
  // 2*heartbeat ms, then they are forgotten
  register: (id: string, load: number) => Promise<{ heartbeat: number }>;

  // clients call this to find out what persist server to connect to when working
  // with a given stream, defined by "Storage".
  getServerId: (storage: Storage) => Promise<string>;
}

const DEFAUL_HEARTBEAT = 30 * 1000;

interface Options {
  heartbeat: number;
  client: Client;
  // path to sqlite database where load balancer stores
  // its state in case of restarts.
  path: string;
}

export async function createLoadBalancer(options: Partial<Options> = {}) {
  options = { heartbeat: DEFAUL_HEARTBEAT, ...options };
  if (options.client == null) {
    options.client = connect();
  }
  if (!options.path) {
    throw Error("path must be specified");
  }
  await ensureContainingDirectoryExists(options.path);
  const lb = new LoadBalancer(options as Options);
  await lb.init();
  return lb;
}

export class LoadBalancer {
  private db: Database;
  private servers: TTL<string, number>;
  private sub?: Subscription;

  constructor(private options: Options) {
    this.servers = new TTL({ ttl: this.options.heartbeat * 2 });
    this.db = createDatabase(this.options.path);
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS streams (
          storage TEXT PRIMARY KEY, server TEXT, time INTEGER NOT NULL
          )
        `,
      )
      .run();
  }

  init = async () => {
    const self = this;
    this.sub = await this.options.client.service<LoadBalancerApi>(
      `${SUBJECT}.*.lb`,
      {
        async register(id: string, load: number) {
          // TODO -- check permissions
          const mesg = this as any;
          if (getUserId(mesg.subject)) {
            throw Error("accounts and projects can't register");
          }
          self.servers.set(id, load);
          return { heartbeat: self.options.heartbeat };
        },

        async getServerId(storage: Storage) {
          // TODO -- check permissions -- though not actually necessary
          const key = jsonStableStringify(storage);
          const x = self.db
            .prepare(`SELECT server FROM streams WHERE storage=$1`)
            .get(key) as null | { server: string };
          if (!x || !self.servers.has(x.server)) {
            // no server allocated or the allocated server is gone, so allocate a server
            const server = self.getServer();
            self.db
              .prepare(
                `INSERT INTO streams (storage, server) VALUES(?, ?) ON CONFLICT(storage) DO UPDATE SET server=excluded.server`,
              )
              .run(key, server);
            return server;
          } else {
            return x.server;
          }
        },
      },
    );
  };

  getServer = () => {
    const v: { load: number; id: string }[] = [];
    for (const [id, load] of this.servers.entries()) {
      v.push({ load, id });
    }
    if (v.length == 0) {
      throw Error("no servers available");
    }
    if (v.length == 1) {
      return v[0].id;
    }
    v.sort(field_cmp("load"));

    // select randomly from the bottom half of servers by load.
    const n = Math.ceil(v.length / 2) + 1;
    const i = Math.floor(Math.random() * n);
    return v[i].id;
  };

  close = () => {
    this.sub?.close();
  };
}

export async function register({
  client,
  user,
  id,
  load,
}: {
  client: Client;
  user: User;
  id: string;
  load: number;
}) {
  const subject = loadBalancerSubject(user);
  const f = client.call<LoadBalancerApi>(subject);
  return await f.register(id, load);
}

export async function getServerId({
  client,
  user,
  storage,
}: {
  client: Client;
  user: User;
  storage: Storage;
}) {
  const subject = loadBalancerSubject(user);
  const f = client.call<LoadBalancerApi>(subject);
  return await f.getServerId(storage);
}
