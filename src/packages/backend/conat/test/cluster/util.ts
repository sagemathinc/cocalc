import { initConatServer } from "@cocalc/backend/conat/test/setup";
import type { Options } from "@cocalc/conat/core/server";

export async function createClusterNode(
  opts: {
    clusterName: string;
    id: string;
  } & Options,
) {
  const server = await initConatServer({
    cluster: true,
    systemAccountPassword: "foo",
    ...opts,
  });
  const client = server.client();
  return { server, client };
}
