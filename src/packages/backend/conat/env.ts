import { sha1 } from "@cocalc/backend/sha1";
import { JSONCodec } from "nats";
import { getConnection } from "./index";
import { connect as getConatClient } from "./conat";

export async function getEnv(options?) {
  const jc = JSONCodec();
  const nc = await getConnection();
  const cn = getConatClient(options);
  return { nc, jc, cn, sha1 };
}
