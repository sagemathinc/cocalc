import getLogger from "@cocalc/backend/logger";
import { setConatClient } from "@cocalc/conat/client";
import { conat } from "./conat";

export { conat };

export function init() {
  setConatClient({ conat: async (opts?) => conat(opts), getLogger });
}
init();
