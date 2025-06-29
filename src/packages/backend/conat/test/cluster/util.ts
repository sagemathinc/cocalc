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
    systemAccountPassword: "foo",
    ...opts,
  });
  const client = server.client();
  return { server, client };
}
