/*
> await a.default({account_id:'15143a10-43f2-48d6-b9cb-63c6111524ba',project_id:'34ce85cd-b4ad-4786-a8f0-67fa9c729b4f',cloud:'google-cloud',configuration:{machineType:'e2-highmem-2',region:'us-west4',zone:'us-west4-a',spot:true, diskSizeGb:15,cloud:'google-cloud'}})
3
> a = require('./dist/compute/create-server')
*/

import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { setData } from "../util";
import { InstancesClient } from "@google-cloud/compute";
import * as pricing from "@cocalc/gcloud-pricing-calculator";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:google-cloud");

let client: undefined | InstancesClient = undefined;
let googleProjectId: undefined | string = undefined;
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
  googleProjectId = serviceAccount.project_id;
  client = new InstancesClient({
    projectId: googleProjectId,
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
  // make sure we can compute cost before starting
  const cost_per_hour = await cost(server);
  logger.debug("starting server with cost $", cost_per_hour, "/hour");
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const client = await getClient();
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

  const disks = [
    {
      autoDelete: true,
      boot: true,
      initializeParams: {
        diskSizeGb: `${conf.diskSizeGb ?? 10}`,
        diskType: `projects/${googleProjectId}/zones/${conf.zone}/diskTypes/pd-balanced`,
        labels: {},
        sourceImage:
          "projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-v20230829",
        // TODO
        //             sourceImage:
        //               "projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-arm64-v20230829",
      },
      mode: "READ_WRITE",
      type: "PERSISTENT",
    },
  ];
  const machineType = `zones/${conf.zone}/machineTypes/${conf.machineType}`;
  const networkInterfaces = [
    {
      accessConfigs: [
        {
          name: "External NAT",
          networkTier: "PREMIUM",
        },
      ],
      stackType: "IPV4_ONLY",
      subnetwork: `projects/${googleProjectId}/regions/${conf.region}/subnetworks/default`,
    },
  ];
  const metadata = {
    items: [
      {
        key: "startup-script",
        value: startupScript,
      },
    ],
  };
  const scheduling = conf.spot
    ? {
        automaticRestart: false,
        instanceTerminationAction: "STOP",
        onHostMaintenance: "TERMINATE",
        provisioningModel: "SPOT",
      }
    : {
        automaticRestart: true,
        instanceTerminationAction: "STOP",
        onHostMaintenance: "MIGRATE",
        provisioningModel: "STANDARD",
      };

  const instanceResource = {
    name,
    disks,
    machineType,
    networkInterfaces,
    metadata,
    scheduling,
  };

  await client.insert({
    project: googleProjectId,
    zone: conf.zone,
    instanceResource,
  });

  await setData(server.id, { name });
}

export async function stop(server: ComputeServer) {
  logger.debug("stop", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const instance = server.data?.name;
  if (!instance) {
    return;
  }
  const client = await getClient();
  await client.delete({
    project: googleProjectId,
    zone: conf.zone,
    instance,
  });
}

export async function state(server: ComputeServer): Promise<State> {
  logger.debug("state", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const instance = server.data?.name;
  if (!instance) {
    return "off";
  }

  const client = await getClient();
  let response;
  try {
    [response] = await client.get({
      project: googleProjectId,
      zone: conf.zone,
      instance,
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return "off";
    }
  }
  const { status } = response;
  logger.debug("got GCP status", status);
  if (status == "booting") {
    return "starting";
  } else if (status == "RUNNING") {
    return "running";
  } else if (status == "STOPPING") {
    return "stopping";
  } else if (status == "STOP") {
    // TODO
    return "off";
  } else {
    return "unknown";
  }
}

export async function cost(server: ComputeServer): Promise<number> {
  logger.debug("cost", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const priceData = await pricing.getData();
  const data = priceData[conf.machineType];
  if (data == null) {
    throw Error(
      `unable to determine cost since machine type ${conf.machineType} is unknown`,
    );
  }
  const vmCost = data[conf.spot ? "spot" : "prices"]?.[conf.region];
  logger.debug("vm cost", { vmCost });
  if (vmCost == null) {
    throw Error(
      `unable to determine cost since region pricing for machine type ${conf.machineType} is unknown`,
    );
  }

  const diskCost = priceData["disk-standard"]?.prices[conf.region];
  logger.debug("disk cost per GB", { diskCost });
  if (diskCost == null) {
    throw Error(
      `unable to determine cost since disk cost in region ${conf.region} is unknown`,
    );
  }

  const total = diskCost * (conf.diskSizeGb ?? 10) + vmCost;
  logger.debug("cost", { total });
  return total;
}

export const test = { getClient };
