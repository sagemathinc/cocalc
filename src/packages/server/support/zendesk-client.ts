import { getServerSettings } from "@cocalc/backend/server-settings";
import { createClient } from "node-zendesk";
import type { Client } from "node-zendesk";

let client: Client | undefined = undefined;
let config = "";
export default  async function getClient(): Promise<Client> {
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
