import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { InstancesClient, ZoneOperationsClient } from "@google-cloud/compute";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:google-cloud:client");

interface Client extends InstancesClient {
  googleProjectId: string;
}
let client: undefined | Client = undefined;

export default async function getClient(): Promise<Client> {
  if (client != null) {
    return client;
  }
  const credentials = await getCredentials();
  client = new InstancesClient(credentials) as Client;
  client.googleProjectId = credentials.projectId;
  return client;
}

export async function getCredentials() {
  const { google_cloud_service_account_json } = await getServerSettings();
  if (!google_cloud_service_account_json) {
    throw Error(
      "The Google Cloud service account for Compute Servers is not configure",
    );
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(google_cloud_service_account_json);
  } catch (err) {
    throw Error(`The Google Cloud service account must be valid JSON - ${err}`);
  }
  return {
    projectId: serviceAccount.project_id,
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    },
  };
}

interface Options {
  name: string;
  zone: string;
  wait?: boolean;
}

export async function deleteInstance({ name, zone, wait }: Options) {
  const client = await getClient();
  const [response] = await client.delete({
    project: client.googleProjectId,
    zone,
    instance: name,
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}

export async function stopInstance({ name, zone, wait }: Options) {
  const client = await getClient();
  const [response] = await client.stop({
    project: client.googleProjectId,
    zone,
    instance: name,
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}

export async function getSerialPortOutput({ name, zone }: Options) {
  const client = await getClient();
  const [response] = await client.getSerialPortOutput({
    project: client.googleProjectId,
    zone,
    instance: name,
  });
  return response.contents;
}

export async function waitUntilOperationComplete({ response, zone }) {
  let operation = response.latestResponse;
  const operationsClient = new ZoneOperationsClient();
  const { googleProjectId } = await getClient();
  logger.debug("Wait for the operation to complete...", operation);
  while (operation.status !== "DONE") {
    [operation] = await operationsClient.wait({
      operation: operation.name,
      project: googleProjectId,
      zone,
    });
  }
}
