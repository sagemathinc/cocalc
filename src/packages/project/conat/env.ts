import { connectToConat } from "./connection";
import { setConatClient } from "@cocalc/conat/client";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";

export async function getEnv() {
  const cn = await connectToConat();
  return { cn } as any;
}

export function init() {
  setConatClient({
    getNatsEnv: getEnv,
    project_id,
    compute_server_id,
    getLogger,
  });
}
init();
