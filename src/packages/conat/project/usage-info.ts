/*
Provide info about a specific path, derived from the project-status stream.
E.g. cpu/ram usage by a Jupyter notebook kernel.

This starts measuring when a request comes in for a path and stop when
there is no request for a while.
*/

import { projectSubject } from "@cocalc/conat/names";
import { conat } from "@cocalc/conat/client";
import { getLogger } from "@cocalc/conat/client";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { type UsageInfo } from "@cocalc/util/types/project-usage-info";
import TTL from "@isaacs/ttlcache";

const logger = getLogger("project:usage-info");

type InfoServer = any;

const SERVICE_NAME = "usage-info";

// we automatically stop computing data about a specific path after this amount of
// time elapses with no user requests.  Users make a request every 2-3 seconds,
// and even it times out, everything starts again in 2-3 seconds.  So this is fine.
const SERVER_TIMEOUT = 15000;

function getSubject({ project_id, compute_server_id }) {
  return projectSubject({
    project_id,
    compute_server_id,
    service: SERVICE_NAME,
  });
}

interface Api {
  get: (path) => Promise<UsageInfo | null>;
}

export async function get({
  client = conat(),
  project_id,
  compute_server_id = 0,
  path,
}: {
  client?: ConatClient;
  project_id: string;
  compute_server_id?: number;
  path: string;
}) {
  const subject = getSubject({ project_id, compute_server_id });
  return await client.call(subject).get(path);
}

interface Options {
  client?: ConatClient;
  project_id: string;
  compute_server_id: number;
  createUsageInfoServer: Function;
}

export class UsageInfoService {
  private service?;
  private infoServers = new TTL<string, InfoServer>({
    ttl: SERVER_TIMEOUT,
    dispose: (server) => this.dispose(server),
  });
  private usage = new TTL<string, UsageInfo>({ ttl: 2 * SERVER_TIMEOUT });

  constructor(private options: Options) {
    this.createService();
  }

  private createService = async () => {
    const subject = getSubject(this.options);
    logger.debug("starting usage-info service", { subject });
    const client = this.options.client ?? conat();
    this.service = await client.service<Api>(subject, {
      get: this.get,
    });
  };

  private get = async (path: string): Promise<UsageInfo | null> => {
    if (!this.infoServers.has(path)) {
      logger.debug("creating new usage server for ", { path });
      const server = this.options.createUsageInfoServer(path);
      this.infoServers.set(path, server);
      server.on("usage", (usage) => {
        // logger.debug("got new info", { path, usage });
        this.usage.set(path, usage);
      });
    }
    return this.usage.get(path) ?? null;
  };

  private dispose = (server) => {
    server.close();
  };

  close = (): void => {
    this.infoServers.clear();
    this.usage.clear();
    this.service?.close();
    delete this.service;
  };
}

export function createUsageInfoService(options: Options) {
  return new UsageInfoService(options);
}
