/*
IMPORTANT NOTE: Basically the only way to figure out how to use any of
this @google-cloud/compute package is via VS Code and typescript, and
following the typescript definitions.  There's no other docs really.
But that works!
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import {
  DisksClient,
  InstancesClient,
  ZoneOperationsClient,
} from "@google-cloud/compute";
import getLogger from "@cocalc/backend/logger";
import { getFullMachineType, getSchedulingModel } from "./create-instance";
import type { GoogleCloudConfiguration } from "@cocalc/util/db-schema/compute-servers";

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
    fallback: true, // see https://github.com/googleapis/google-cloud-node/issues/2933#issuecomment-547657659
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

// [ ] MAJOR TODO: need to check if the configuration of the existing instance
// has changed, and if so, edit it before starting the instance!

export async function startInstance({ name, zone, wait }: Options) {
  const client = await getClient();
  const [response] = await client.start({
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

export async function rebootInstance({ name, zone, wait }: Options) {
  const client = await getClient();
  const [response] = await client.reset({
    project: client.googleProjectId,
    zone,
    instance: name,
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}

export async function suspendInstance({ name, zone, wait }: Options) {
  const client = await getClient();
  const [response] = await client.suspend({
    project: client.googleProjectId,
    zone,
    instance: name,
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}

export async function resumeInstance({ name, zone, wait }: Options) {
  const client = await getClient();
  const [response] = await client.resume({
    project: client.googleProjectId,
    zone,
    instance: name,
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}

export async function getSerialPortOutput({
  name,
  zone,
}: Options): Promise<string> {
  const client = await getClient();
  const [response] = await client.getSerialPortOutput({
    project: client.googleProjectId,
    zone,
    instance: name,
  });
  return response.contents ?? "";
}

export async function waitUntilOperationComplete({ response, zone }) {
  let operation = response.latestResponse;
  const credentials = await getCredentials();
  const operationsClient = new ZoneOperationsClient(credentials);
  logger.debug("Wait for the operation to complete...", operation);
  while (operation.status !== "DONE") {
    [operation] = await operationsClient.wait({
      operation: operation.name,
      project: credentials.projectId,
      zone,
    });
  }
}

interface ChangeOptions extends Options {
  configuration: GoogleCloudConfiguration;
}

export async function setMachineType({
  name,
  zone,
  wait,
  configuration,
}: ChangeOptions) {
  const client = await getClient();
  const [response] = await client.setMachineType({
    project: client.googleProjectId,
    zone,
    instance: name,
    instancesSetMachineTypeRequestResource: {
      machineType: getFullMachineType(configuration),
    },
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}

export async function setSpot({
  name,
  zone,
  wait,
  configuration,
}: ChangeOptions) {
  const client = await getClient();
  const [response] = await client.setScheduling({
    project: client.googleProjectId,
    zone,
    instance: name,
    schedulingResource: getSchedulingModel(configuration),
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}

export async function increaseBootDiskSize({
  name,
  zone,
  wait,
  configuration,
}: ChangeOptions) {
  const credentials = await getCredentials();
  const client = new DisksClient(credentials);

  const [response] = await client.resize({
    disk: name,
    disksResizeRequestResource: { sizeGb: configuration.diskSizeGb },
    project: credentials.projectId,
    zone,
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}
