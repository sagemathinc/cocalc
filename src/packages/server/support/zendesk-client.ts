import type { ZendeskClient } from "node-zendesk";
import { createClient } from "node-zendesk";

import { getServerSettings } from "@cocalc/database/settings";

let client: ZendeskClient | undefined = undefined;

let config = "";

export default async function getClient(): Promise<ZendeskClient> {
  const {
    zendesk_token: token,
    zendesk_username: username,
    zendesk_uri,
  } = await getServerSettings();

  const subdomain = extractSubdomain(zendesk_uri);
  const config0 = `${token + username + subdomain}`;
  if (config == config0 && client != null) {
    return client;
  }
  if (client == null) {
    // Get the credential from the database.
    if (!token) {
      throw Error(
        "Support not available -- admin must configure the Zendesk token",
      );
    }
    if (!username) {
      throw Error(
        "Support not available -- admin must configure the Zendesk username",
      );
    }
    if (!subdomain) {
      throw Error(
        "Support not available -- admin must configure the Zendesk subdomain",
      );
    }
    config = config0;
    client = createClient({ username, token, subdomain });
  }
  return client;
}

// newer client just wants the subdomain.
// so, if the uri starts with "http", extract the subdomain – otherwise just return the uri.
export function extractSubdomain(uri: string): string {
  if (uri.startsWith("http")) {
    return uri.split(".")[0].split("//")[1];
  } else {
    return uri;
  }
}
