import { sha1 } from "@cocalc/backend/sha1";
import getConnection from "./connection";
import { JSONCodec } from "nats";

export async function getEnv() {
  const nc = await getConnection();
  const jc = JSONCodec();
  return { sha1, nc, jc };
}
