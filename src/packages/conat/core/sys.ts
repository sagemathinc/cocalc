import { type Client } from "./client";
import type { ConnectionStats } from "./types";

export const SYS_API_SUBJECT = "sys.conat.server";

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
  clusterAddresses: () => Promise<string[]>;
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
