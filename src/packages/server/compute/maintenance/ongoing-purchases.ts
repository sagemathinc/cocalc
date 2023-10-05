import getLogger from "@cocalc/backend/logger";
const logger = getLogger("server:compute:maintain-purchases");

export default async function maintainOngoingPurchases() {
  logger.debug("maintainOngoingPurchases");
}
