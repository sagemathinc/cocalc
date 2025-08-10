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

const SUBJECT = "file-server";

export interface Options {
  client?: Client;
  mount: (opts: { project_id: string }) => Promise<void>;
}

export interface API {
  mount: (opts: { project_id: string }) => Promise<void>;
}

export async function server({ client, mount }: Options) {
  client ??= conat();

  const sub = await client.service<API>(SUBJECT, {
    async mount(opts: { project_id: string }) {
      await mount(opts);
    },
  });

  return {
    close: () => {
      sub.close();
    },
  };
}

export function client({ client }: { client?: Client }): API {
  client ??= conat();
  return client.call<API>(SUBJECT);
}
