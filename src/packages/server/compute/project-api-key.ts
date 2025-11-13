import manageApiKeys from "@cocalc/server/api/manage";
import getPool from "@cocalc/database/pool";
import dayjs from "dayjs";
import type { ComputeServer } from "@cocalc/util/db-schema/compute-servers";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:project-api-key");

interface Options {
  account_id: string;
  server: ComputeServer;
}

export async function setProjectApiKey({
  account_id,
  server,
}: Options): Promise<string> {
  logger.debug("setProjectApiKey", { account_id, server_id: server.id });
  if (server.api_key) {
    // delete the existing one and create a new one below -- this is for maximal security.
    logger.debug("setProjectApiKey: delete the existing one");
    await deleteProjectApiKey({ account_id, server });
  }
  const name = `Computer Server ${server.id}`;
  logger.debug("setProjectApiKey: create new one -- ", name);
  const x = await manageApiKeys({
    action: "create",
    account_id,
    project_id: server.project_id,
    name,
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
  logger.debug("setProjectApiKey: saving new key with compute server");
  await pool.query(
    "UPDATE compute_servers SET api_key=$1, api_key_id=$2 WHERE id=$3",
    [apiKey.secret, apiKey.id, server.id],
  );
  server.api_key = apiKey.secret;
  server.api_key_id = apiKey.id;
  return apiKey.secret;
}

export async function deleteProjectApiKey({ account_id, server }: Options) {
  logger.debug("deleteProjectApiKey: ", {
    account_id,
    server_id: server.id,
  });
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT api_key_id FROM compute_servers WHERE id=$1",
    [server.id],
  );
  if (rows.length == 0) {
    throw Error(`no such compute server`);
  }
  const { api_key_id } = rows[0];
  await manageApiKeys({
    action: "delete",
    account_id,
    project_id: server.project_id,
    id: api_key_id,
  });
  await pool.query(
    "UPDATE compute_servers SET api_key=NULL, api_key_id=NULL WHERE id=$1",
    [server.id],
  );
  delete server.api_key;
  delete server.api_key_id;
}
