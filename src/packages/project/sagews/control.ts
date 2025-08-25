import { getLogger } from "@cocalc/backend/logger";
const logger = getLogger("project:sagews:control");

export async function sagewsStart(path_ipynb: string) {
  logger.debug("sagewsStart: ", path_ipynb);
}

export async function sagewsStop(path_ipynb: string) {
  logger.debug("sagewsStop: ", path_ipynb);
}
