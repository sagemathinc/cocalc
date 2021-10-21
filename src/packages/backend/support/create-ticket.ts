import { getServerSettings } from "@cocalc/backend/server-settings";
import { createClient } from "node-zendesk";
import type { Client, Tickets } from "node-zendesk";
import { getLogger } from "@cocalc/backend/logger";
import siteURL from "@cocalc/backend/server-settings/site-url";
import getName, { getNameByEmail } from "@cocalc/backend/accounts/get-name";

const log = getLogger("support:create-ticket");

interface Options {
  email: string;
  account_id?: string;
  files?: { project_id: string; path?: string }[];
  type?: "bug" | "question";
  subject?: string;
  body?: string;
  url?: string;
  info?: {
    userAgent?: string;
    browser?: string;
  };
}

export default async function createTicket(options: Options): Promise<string> {
  log.debug("createTicket", options);
  const client = await getClient();

  const { account_id, email, files, type, subject, url, info } = options;
  const user = await getUser(email, account_id);

  // create corresponding zendesk user, or get current user if already created.
  const userResult = await client.users.createOrUpdate(user);
  log.debug("got ", { userResult });

  let { body } = options;

  if (url) {
    body += `\n\n\nURL:\n${url}\n`;
  }
  if (files && files.length > 0) {
    body += "\n\n\nRELEVANT FILES:\n\n";
    for (const file of files) {
      body += `\n\n${await toURL(file)}\n`;
    }
  }
  if (info) {
    body += "\n\n\nBROWSER INFO:\n\n";
    body += `\n\nuserAgent="${info.userAgent}"`;
    body += `\n\nbrowser="${info.browser}"`;
  }

  // It's very helpful to look https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/node-zendesk/index.d.ts
  // and
  // https://github.com/blakmatrix/node-zendesk/tree/master/examples
  const ticket = {
    ticket: {
      comment: { body },
      external_id: account_id,
      subject,
      type: (type == "bug" ? "problem" : "question") as Tickets.TicketType,
      // @ts-ignore: @types/node-zendesk is wrong:
      requester_id: userResult.id,
    },
  };

  log.debug("ticket ", ticket);

  const ticketResult = await client.tickets.create(ticket);
  log.debug("got ", { ticketResult });
  // @ts-ignore:  @types/node-zendesk is wrong about fields in ticketResult.
  return ticketResult.url
    .replace("api/v2/tickets", "requests")
    .replace(".json", "");
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

async function toURL({
  project_id,
  path,
}: {
  project_id: string;
  path?: string;
}) {
  let s = (await siteURL()) + "/" + encodeURI(`projects/${project_id}`);
  if (!path) return s;
  return s + `/files/${path}`;
}

async function getUser(
  email: string,
  account_id?: string
): Promise<{
  user: { name: string; email: string; external_id: string | null };
}> {
  let name: string | undefined = undefined;
  if (account_id) {
    name = await getName(account_id);
  }
  if (!name) {
    name = await getNameByEmail(email);
  }
  // name: must be at least one character, even " " is causing errors
  // https://developer.zendesk.com/rest_api/docs/core/users
  if (!name?.trim()) {
    name = email;
  }
  return {
    user: { name, email, external_id: account_id ?? null },
  };
}
