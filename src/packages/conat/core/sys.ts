import { type Client } from "./client";
import type { ConnectionStats } from "./types";

// requests go to *all* nodes in the cluster
//   sys.conat.[clusterName]
// or sys.conat.default if there is no cluster.
export function sysApiSubject({
  clusterName,
  id,
}: {
  clusterName?: string;
  id?: string;
}) {
  if (!id) {
    return `sys.conat.${clusterName ?? "default"}`;
  } else {
    return `sys.conat.${clusterName ?? "default"}.${id}`;
  }
}

export interface SysConatServer {
  stats: () => Promise<{ [id: string]: { [id: string]: ConnectionStats } }>;
  usage: () => Promise<{
    [id: string]: { total: number; perUser: { [user: string]: number } };
  }>;
  disconnect: (ids: string | string[]) => Promise<void>;
  join: (address: string) => Promise<void>;
  unjoin: (opts: { clusterName?: string; id: string }) => Promise<void>;
  clusterTopology: () => Promise<{
    [clusterName: string]: { [id: string]: string };
  }>;
  clusterAddresses: (clusterName?: string) => Promise<string[]>;
}

export interface SysConatServerCallMany {
  stats: () => Promise<{ [id: string]: { [id: string]: ConnectionStats } }[]>;
  usage: () => Promise<
    {
      [id: string]: { total: number; perUser: { [user: string]: number } };
    }[]
  >;
  disconnect: (ids: string | string[]) => Promise<void>;
}

export function sysApi(client: Client, opts?): SysConatServer {
  if (client.info == null) {
    throw Error("client must be signed in");
  }
  const subject = sysApiSubject(client.info);
  return client.call<SysConatServer>(subject, opts);
}

export function sysApiMany(client: Client, opts?): SysConatServerCallMany {
  if (client.info == null) {
    throw Error("client must be signed in");
  }
  const subject = sysApiSubject({ clusterName: client.info.clusterName });
  return client.callMany<SysConatServerCallMany>(subject, opts);
}
