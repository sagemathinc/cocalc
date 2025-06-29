import { type Client } from "./client";
import type { ConnectionStats } from "./types";

// requests go to *all* nodes in the cluster
//   sys.conat.[clusterName]
// or sys.conat.default if there is no cluster.
export function getSubject({
  clusterName,
  id,
}: {
  clusterName: string?;
  id?: string;
}) {
  if (!id) {
    return `sys.conat.${clusterName ?? "default"}`;
  } else {
    return `sys.conat.${clusterName ?? "default"}.${id}`;
  }
}

// requests go to only one specific node in the local cluster,
// where * is the name of the server node.
//   sys.conat.[clusterName].[serverId]
export const SYS_API_NODE_PATTERN = "sys.conat.*.*";

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
}

export function sysApi(client: Client, opts?): SysConatServer {
  return client.call<SysConatServer>(SYS_API_SUBJECT, opts);
}

export function sysApiMany(client: Client, opts?): SysConatServerCallMany {
  return client.callMany<SysConatServerCallMany>(SYS_API_SUBJECT, opts);
}
