import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import getLogger from "@cocalc/backend/logger";
import { setData } from "../util";
import pricing from "@cocalc/gcloud-pricing-calculator";
import { InstancesClient } from "@google-cloud/compute";

const logger = getLogger("server:compute:google-cloud");

let client: null | InstancesClient = null;
export async function getClient() {
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
  });
  return client;
}

function getServerName(server: ComputeServer) {
  return `cocalc-compute-server-${server.id}`;
}

export async function start(server: ComputeServer) {
  logger.debug("start", server);
  if (server.configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  // TODO:
  const name = getServerName(server);
  logger.debug("creating google cloud instance ", name);

  const startupScript = `
#!/bin/bash

apt update -y
apt install -y docker.io
docker run  \
   -e API_KEY=${process.env.API_KEY} \
   -e PROJECT_ID=${server.project_id} \
   -e TERM_PATH=a.term \
   --privileged \
   --mount type=bind,source=/home,target=/home,bind-propagation=rshared \
   -v /var/run/docker.sock:/var/run/docker.sock \
   sagemathinc/compute
`;

  const zone = "us-west4-a";
  const machineType = "e2-highmem-2";

  const instanceResource = {
    name,
    disks,
    machineType: `zones/${zone}/machineTypes/${machineType}`,
  };

  const [response] = await instancesClient.insert({
    project: client._opts.projectId,
    zone,
    instanceResource,
  });

  await setData(server.id, { name });
}

export async function stop(server: ComputeServer) {
  logger.debug("top", server);
  const instance_id = server.data?.instance_id;
  if (!instance_id) {
    return;
  }
  const client = await getClient();
  await client.terminateInstances([instance_id]);
}

export async function state(server: ComputeServer): Promise<State> {
  logger.debug("state", server);
  const instance_id = server.data?.instance_id;
  if (!instance_id) {
    return "off";
  }

  const client = await getClient();
  const instance = await client.getRunningInstance(instance_id);
  logger.debug("state", instance);
  await setData(server.id, { instance });
  if (instance.status == "booting") {
    return "starting";
  } else if (instance.status == "active") {
    return "running";
  } else if (instance.status == "terminated") {
    return "off";
  } else {
    return "unknown";
  }
}

export const test = { getClient, getAvailableInstances };
