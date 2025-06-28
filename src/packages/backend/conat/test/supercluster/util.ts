import { initConatServer } from "@cocalc/backend/conat/test/setup";

let clusterName = 0;
export async function createCluster(opts?) {
  clusterName += 1;
  const server = await initConatServer({
    clusterName: `${clusterName}`,
    id: "0",
    systemAccountPassword: "foo",
    ...opts,
  });
  const client = server.client();
  return { server, client };
}
