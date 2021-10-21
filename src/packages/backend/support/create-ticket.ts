import { getServerSettings } from "@cocalc/backend/server-settings";
import { createClient } from "node-zendesk";
import type { Client } from "node-zendesk";
import { getLogger } from "@cocalc/backend/logger";

const log = getLogger("support:create-ticket");

interface Options {}

export default async function createTicket(options: Options): Promise<string> {
  log.debug("createTicket", options);
  const ticket = {
    ticket: {
      subject: "My printer is on fire!",
      comment: {
        body: "The smoke is very colorful.",
      },
    },
  };

  const client = await getClient();
  const result = await client.tickets.create(ticket);
  log.debug("got ", result);
  // @ts-ignore: I guess @types/node-zendesk is wrong.
  return result.url.replace("api/v2/tickets", "requests").replace(".json", "");
}

let client: Client | undefined = undefined;
let config = "";
async function getClient(): Promise<Client> {
  const {
    zendesk_token: token,
    zendesk_username: username,
    zendesk_uri: remoteUri,
  } = await getServerSettings();
  const config0 = `${token + username + remoteUri}`;
  if (config == config0 && client != null) {
    return client;
  }
  if (client == null) {
    // Get the credential from the database.
    if (!token) {
      throw Error(
        "Support not available -- admin must configure the Zendesk token"
      );
    }
    if (!username) {
      throw Error(
        "Support not available -- admin must configure the Zendesk username"
      );
    }
    if (!remoteUri) {
      throw Error(
        "Support not available -- admin must configure the Zendesk Uri"
      );
    }
    config = config0;
    client = createClient({ username, token, remoteUri });
  }
  return client;
}
