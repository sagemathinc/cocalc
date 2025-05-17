import { sha1 } from "@cocalc/backend/sha1";
import getConnection, { connectToConat } from "./connection";
import { JSONCodec } from "nats";
import { setNatsClient } from "@cocalc/nats/client";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";

const jc = JSONCodec();
export async function getEnv() {
  const nc = await getConnection();
  const cn = connectToConat();
  return { sha1, nc, jc, cn };
}

export function init() {
  setNatsClient({
    getNatsEnv: getEnv,
    project_id,
    compute_server_id,
    getLogger,
  });
}
init();
