/*
File server - managers where projects are stored.

This is a conat service that runs directly on the btrfs file server.
Only admin processes (hubs) can talk directly to it, not normal users.
It handles:

Core Functionality:

  - creating volume where a project's files are stored
     - from scratch, and as a zero-cost clone of an existing project
  - copy files between distinct volumes (with btrfs this is done via
    highly efficient dedup'd cloning).

Additional functionality:
  - set a quota on project volume
  - delete volume
  - create snapshot
  - update snapshots
  - create backup

*/

import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";
import { type CopyOptions } from "./fs";
export { type CopyOptions };

const SUBJECT = "file-server";

export interface Fileserver {
  mount: (opts: { project_id: string }) => Promise<{ path: string }>;

  // create project_id as an exact lightweight clone of src_project_id
  clone: (opts: {
    project_id: string;
    src_project_id: string;
  }) => Promise<void>;

  getUsage: (opts: { project_id: string }) => Promise<{
    size: number;
    used: number;
    free: number;
  }>;

  getQuota: (opts: { project_id: string }) => Promise<{
    size: number;
    used: number;
  }>;

  setQuota: (opts: {
    project_id: string;
    size: number | string;
  }) => Promise<void>;

  cp: (opts: {
    src: { project_id: string; path: string | string[] };
    dest: { project_id: string; path: string };
    options?: CopyOptions;
  }) => Promise<void>;
}

export interface Options extends Fileserver {
  client?: Client;
}

export async function server({ client, ...impl }: Options) {
  client ??= conat();

  const sub = await client.service<Fileserver>(SUBJECT, impl);

  return {
    close: () => {
      sub.close();
    },
  };
}

export function client({ client }: { client?: Client } = {}): Fileserver {
  client ??= conat();
  return client.call<Fileserver>(SUBJECT);
}
