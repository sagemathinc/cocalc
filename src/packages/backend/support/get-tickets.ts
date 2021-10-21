import { getLogger } from "@cocalc/backend/logger";
const log = getLogger("support:get-tickets");

interface Ticket {}

export default async function getTickets(
  account_id: string
): Promise<Ticket[]> {
  log.debug("getTickets", account_id);
  return [];
}
