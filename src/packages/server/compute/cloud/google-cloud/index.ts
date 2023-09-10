/*
a = require('./dist/compute/create-server'); await a.default({account_id:'15143a10-43f2-48d6-b9cb-63c6111524ba',project_id:'34ce85cd-b4ad-4786-a8f0-67fa9c729b4f',cloud:'google-cloud',configuration:{machineType:'n1-standard-4',region:'us-central1',zone:'us-central1-c'',spot:true, diskSizeGb:15,cloud:'google-cloud'}})



a = require('./dist/compute/create-server'); await a.default({account_id:'15143a10-43f2-48d6-b9cb-63c6111524ba',project_id:'34ce85cd-b4ad-4786-a8f0-67fa9c729b4f',cloud:'google-cloud',configuration: {"spot": true, "zone": "us-central1-a", "cloud": "google-cloud", "region": "us-central1", "diskSizeGb": 50, "machineType": "n1-standard-2", "acceleratorType": "nvidia-tesla-t4", "acceleratorCount": 1}});


a = require('./dist/compute/create-server'); await a.default({account_id:'15143a10-43f2-48d6-b9cb-63c6111524ba',project_id:'34ce85cd-b4ad-4786-a8f0-67fa9c729b4f',cloud:'google-cloud',configuration: {"spot": true, "zone": "us-central1-a", "cloud": "google-cloud", "region": "us-central1", "machineType": "t2a-standard-2"}});

*/

import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { setData } from "@cocalc/server/compute/util";
import { InstancesClient } from "@google-cloud/compute";
import * as pricing from "@cocalc/gcloud-pricing-calculator";
import startupScript from "@cocalc/server/compute/cloud/startup-script";
import getLogger from "@cocalc/backend/logger";
import { supportsStandardNetworkTier } from "./util";

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

  if (conf.acceleratorType == "nvidia-tesla-k80") {
    throw Error("the nvidia-tesla-k80 GPU is NOT supported");
  }

  const disks = [
    {
      autoDelete: true,
      boot: true,
      initializeParams: {
        diskSizeGb: `${conf.diskSizeGb ?? 10}`,
        diskType: `projects/${googleProjectId}/zones/${conf.zone}/diskTypes/pd-balanced`,
        labels: {},
        sourceImage: `projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-${
          conf.machineType.startsWith("t2a-") ? "arm64-" : ""
        }v20230829`,
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
          networkTier: supportsStandardNetworkTier(conf.region)
            ? "STANDARD"
            : "PREMIUM",
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
        value: startupScript({
          api_key: server.api_key,
          project_id: server.project_id,
        }),
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
        onHostMaintenance: !conf.acceleratorType ? "MIGRATE" : "TERMINATE",
        provisioningModel: "STANDARD",
      };

  const guestAccelerators = !conf.acceleratorType
    ? []
    : [
        {
          acceleratorCount: conf.acceleratorCount ?? 1,
          acceleratorType: `projects/${googleProjectId}/zones/${conf.zone}/acceleratorTypes/${conf.acceleratorType}`,
        },
      ];

  const instanceResource = {
    name,
    disks,
    machineType,
    networkInterfaces,
    metadata,
    scheduling,
    guestAccelerators,
  };
  logger.debug("create instance", instanceResource);

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
  switch (status) {
    case "PROVISIONING":
    case "STAGING":
      return "starting";
    case "RUNNING":
      return "running";
    case "STOPPING":
      return "stopping";
    case "STOP": // ??
      return "off";
    default:
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

  let acceleratorCost;
  if (conf.acceleratorType) {
    // we have 1 or more GPU!
    const acceleratorCount = conf.acceleratorCount ?? 1;
    // sometimes google has "tesla-" in the name, sometimest they don't,
    // but our pricing data doesn't.
    const acceleratorData =
      priceData[conf.acceleratorType] ??
      priceData[conf.acceleratorType.replace("tesla-", "")];
    if (acceleratorData == null) {
      throw Error(`unknown GPU accelerator ${conf.acceleratorType}`);
    }
    const costPer =
      acceleratorData[conf.spot ? "spot" : "prices"]?.[conf.region];
    logger.debug("accelerator cost per", { costPer });
    if (costPer == null) {
      throw Error(
        `GPU accelerator ${conf.acceleratorType} not available in region ${conf.region}`,
      );
    }
    acceleratorCost = costPer * acceleratorCount;
  } else {
    acceleratorCost = 0;
  }

  const total = diskCost * (conf.diskSizeGb ?? 10) + vmCost + acceleratorCost;
  logger.debug("cost", { total });
  return total;
}

export const test = { getClient };
