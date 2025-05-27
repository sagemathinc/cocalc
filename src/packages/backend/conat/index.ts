import getLogger from "@cocalc/backend/logger";
import { getEnv } from "./env";
export { getEnv };
import { setConatClient } from "@cocalc/conat/client";
import getConnection from "@cocalc/backend/conat/persistent-connection";

export { getConnection };

export function init() {
  setConatClient({ getNatsEnv: getEnv, getLogger });
}
init();
