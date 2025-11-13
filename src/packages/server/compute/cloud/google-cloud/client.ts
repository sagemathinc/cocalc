/*
IMPORTANT NOTE: Basically the only way to figure out how to use any of
this @google-cloud/compute package is via VS Code and typescript, and
following the typescript definitions.  There's no other docs really.
But that works!

UPDATE: VS Code is very helpful, but there are now good public API docs at

https://googleapis.dev/nodejs/compute/latest/index.html
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import {
  DisksClient,
  InstancesClient,
  ZoneOperationsClient,
} from "@google-cloud/compute";
import getLogger from "@cocalc/backend/logger";
import {
  getFullMachineType,
  getSchedulingModel,
  getGuestAccelerators,
} from "./create-instance";
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

export async function getCredentials(service_account_json?: string) {
  if (!service_account_json) {
    const { google_cloud_service_account_json } = await getServerSettings();
    if (!google_cloud_service_account_json) {
      throw Error(
        "The Google Cloud service account for Compute Servers is not configure",
      );
    }
    service_account_json = google_cloud_service_account_json;
  }
  if (!service_account_json) {
    throw Error("service account not configured");
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(service_account_json);
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

export async function waitUntilOperationComplete({
  response,
  zone,
}: {
  response;
  zone?;
}) {
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

// Change the machine type of an 'off' instance.
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

// Changes the number and/or type of accelerator for a stopped instance to the values specified in the request.
export async function setAccelerator({
  name,
  zone,
  wait,
  configuration,
}: ChangeOptions) {
  const client = await getClient();
  const [response] = await client.setMachineResources({
    project: client.googleProjectId,
    zone,
    instance: name,
    instancesSetMachineResourcesRequestResource: {
      guestAccelerators: getGuestAccelerators(configuration, client),
    },
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}

// Changer whether it is a spot or standard instance.
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

// Increase size of the boot disk.  Linux automatically detects and handles
// this when the instance starts up.
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

interface MetadataOptions extends Options {
  metadata: { [key: string]: string | null };
}

export async function setMetadata({
  name,
  zone,
  wait,
  metadata,
}: MetadataOptions) {
  const items: { key: string; value: string | null }[] = [];
  for (const key in metadata) {
    items.push({ key, value: metadata[key] });
    // not logging value, since it usually has sensitive info in it, e.g., api key.
    logger.debug("setMetadata", { name, key });
  }
  const client = await getClient();

  // First, fetch the current metadata of the instance
  const [instance] = await client.get({
    project: client.googleProjectId,
    zone,
    instance: name,
  });

  // Extract the current fingerprint from the instance metadata
  const fingerprint = instance.metadata?.fingerprint;

  const [response] = await client.setMetadata({
    project: client.googleProjectId,
    zone,
    instance: name,
    metadataResource: { items, fingerprint },
  });
  if (wait) {
    await waitUntilOperationComplete({ response, zone });
  }
}
