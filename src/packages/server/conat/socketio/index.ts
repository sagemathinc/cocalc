export { init as initConatServer } from "./server";
import { loadConatConfiguration } from "../configuration";
import { conat } from "@cocalc/backend/conat";
import { createStickyRouter } from "@cocalc/conat/core/sticky";

export async function initStickyRouterService() {
  await loadConatConfiguration();
  const client = conat();
  createStickyRouter({ client });
}
