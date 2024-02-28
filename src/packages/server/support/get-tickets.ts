import { Ticket } from "node-zendesk/dist/types/clients/core/tickets";

import { isValidUUID } from "@cocalc/util/misc";
import { urlToUserURL } from "./util";
import getClient from "./zendesk-client";

export default async function getTickets(
  account_id: string,
): Promise<Ticket[]> {
  if (!isValidUUID(account_id)) {
    return [];
  }
  const client = await getClient();

  // See https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/
  const query = `type:ticket external_id:${account_id}`;
  // @ts-ignore
  const result = await client.search.queryAll(query);
  for (const ticket of result) {
    // ticket url is a JSON object, but we need a nice link that the user can click
    // on to interact with the ticket.
    ticket.userURL = urlToUserURL(ticket.url);
  }
  return result;
}
