import { sha1 } from "@cocalc/backend/sha1";
import { connect as getConatClient } from "./conat";

export async function getEnv(options?) {
  const jc = null as any;
  const nc = null as any;
  const cn = getConatClient(options);
  return { nc, jc, cn, sha1 };
}
