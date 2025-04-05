import { sha1 } from "@cocalc/backend/sha1";
import { JSONCodec } from "nats";
import { getConnection } from "./index";

export async function getEnv() {
  const jc = JSONCodec();
  const nc = await getConnection();
  return { nc, jc, sha1 };
}
