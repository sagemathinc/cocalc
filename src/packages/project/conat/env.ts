import { connectToConat } from "./connection";
import { setConatClient } from "@cocalc/conat/client";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";

export function init() {
  setConatClient({
    conat: () => connectToConat(),
    project_id,
    compute_server_id,
    getLogger,
  });
}
init();
