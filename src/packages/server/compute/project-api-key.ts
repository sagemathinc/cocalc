import manageApiKeys from "@cocalc/server/api/manage";
import getPool from "@cocalc/database/pool";
import dayjs from "dayjs";
import type { ComputeServer } from "@cocalc/util/db-schema/compute-servers";

interface Options {
  account_id: string;
  server: ComputeServer;
}

export async function setProjectApiKey({ account_id, server }: Options) {
  if (server.api_key) {
    // one is already set, so just stick with that
    // TODO: or we could delete it and create a new one...
    //  await deleteProjectApiKey({ account_id, server });
    return;
  }
  const x = await manageApiKeys({
    action: "create",
    account_id,
    project_id: server.project_id,
    name: `Computer Server ${server.id}`,
    expire: dayjs().add(1, "year").toDate(),
  });
  if (x == null) {
    return;
  }
  const [apiKey] = x;
  const pool = getPool();
  await pool.query(
    "UPDATE compute_servers SET api_key=$1, api_key_id=$2 WHERE id=$3",
    [apiKey.secret, apiKey.id, server.id],
  );
  server.api_key = apiKey.secret;
  server.api_key_id = apiKey.id;
}

export async function deleteProjectApiKey({ account_id, server }: Options) {
  if (!server.api_key || !server.api_key_id) {
    // nothing we can do
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
