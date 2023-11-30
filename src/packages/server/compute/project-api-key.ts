import manageApiKeys from "@cocalc/server/api/manage";
import getPool from "@cocalc/database/pool";
import dayjs from "dayjs";
import type { ComputeServer } from "@cocalc/util/db-schema/compute-servers";

interface Options {
  account_id: string;
  server: ComputeServer;
}

export async function setProjectApiKey({
  account_id,
  server,
}: Options): Promise<string> {
  if (server.api_key) {
    // delete the existing one and create a new one below -- this is for maximal security.
    await deleteProjectApiKey({ account_id, server });
  }
  const x = await manageApiKeys({
    action: "create",
    account_id,
    project_id: server.project_id,
    name: `Computer Server ${server.id}`,
    // TODO: we don't have any notion of in place api key rotation implemented yet,
    // so a compute server running nonstop for this long just stop working with
    // no automated way to fix itself.  So we make this very long for now.  When we
    // implement key rotation, we will make this very short.
    // Note that we manually delete the key ALWAYS whenever the VM stops or
    // deprovisioned, so it's not like this key gets left around to cause trouble.
    expire: dayjs().add(10, "year").toDate(),
  });
  if (x == null) {
    throw Error("failed to create api key");
  }
  const [apiKey] = x;
  if (!apiKey.secret) {
    throw Error("api key failed");
  }
  const pool = getPool();
  await pool.query(
    "UPDATE compute_servers SET api_key=$1, api_key_id=$2 WHERE id=$3",
    [apiKey.secret, apiKey.id, server.id],
  );
  server.api_key = apiKey.secret;
  server.api_key_id = apiKey.id;
  return apiKey.secret;
}

export async function deleteProjectApiKey({ account_id, server }: Options) {
  if (!server.api_key || !server.api_key_id) {
    // nothing we need to do
    return;
  }
  await manageApiKeys({
    action: "delete",
    account_id,
    project_id: server.project_id,
    id: server.api_key_id,
  });
  const pool = getPool();
  await pool.query(
    "UPDATE compute_servers SET api_key=NULL, api_key_id=NULL WHERE id=$1",
    [server.id],
  );
  delete server.api_key;
  delete server.api_key_id;
}
