import { sha1 } from "@cocalc/backend/sha1";
import getConnection from "./connection";
import { JSONCodec } from "nats";

const jc = JSONCodec();
export async function getEnv() {
  const nc = await getConnection();
  return { sha1, nc, jc };
}
