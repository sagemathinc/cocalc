import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { InstancesClient } from "@google-cloud/compute";

interface Client extends InstancesClient {
  googleProjectId: string;
}
let client: undefined | Client = undefined;

export default async function getClient(): Promise<Client> {
  if (client != null) {
    return client;
  }
  const { google_cloud_service_account_json } = await getServerSettings();
  if (!google_cloud_service_account_json) {
    throw Error(
      "The Google Cloud service account for compute servers is not configure",
    );
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(google_cloud_service_account_json);
  } catch (err) {
    throw Error(`The Google Cloud service account must be valid JSON - ${err}`);
  }
  client = new InstancesClient({
    projectId: serviceAccount.project_id,
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    },
  }) as Client;
  client.googleProjectId = serviceAccount.project_id;
  return client;
}
