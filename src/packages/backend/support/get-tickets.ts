import getClient from "./zendesk-client";
import { is_valid_uuid_string as isValidUUID } from "@cocalc/util/misc";
import type { Tickets } from "node-zendesk";
import { urlToUserURL } from "./util";

export default async function getTickets(
  account_id: string
): Promise<Tickets.TicketType[]> {
  if (!isValidUUID(account_id)) {
    return [];
  }
  const client = await getClient();

  // See https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/
  const query = `type:ticket external_id:${account_id}`;
  // @ts-ignore
  const result = await client.search.query(query);
  for (const ticket of result) {
    // ticket url is a JSON object, but we need a nice link that the user can click
    // on to interact with the ticket.
    ticket.userURL = urlToUserURL(ticket.url);
  }
  return result;
}
