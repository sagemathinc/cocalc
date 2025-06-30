import { initConatServer } from "@cocalc/backend/conat/test/setup";
import type { Options, ConatServer } from "@cocalc/conat/core/server";
import type { Client } from "@cocalc/conat/core/client";

export async function createClusterNode(
  opts: {
    clusterName: string;
    id: string;
  } & Options,
): Promise<{ server: ConatServer; client: Client }> {
  const server = await initConatServer({
    // disable autoscan so we can precisely control connections when building clusters for unit testing.
    autoscanInterval: 0,
    systemAccountPassword: "foo",
    getUser: async () => {
      return { hub_id: "system" };
    },
    ...opts,
  });
  const client = server.client({ systemAccountPassword: "foo" });
  await client.waitUntilSignedIn();
  return { server, client };
}
