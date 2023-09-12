import type { GoogleCloudConfiguration } from "@cocalc/util/db-schema/compute-servers";
import getClient from "./client";
import getLogger from "@cocalc/backend/logger";
import { supportsStandardNetworkTier } from "./util";

const logger = getLogger("server:compute:google-cloud:create-instance");

interface Options {
  name: string;
  configuration: GoogleCloudConfiguration;
  startupScript?: string;
  sourceImage?: string;
  metadata?: object;
}

export default async function createInstance({
  configuration,
  name,
  startupScript,
  sourceImage,
  metadata,
}: Options) {
  if (configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const client = await getClient();
  logger.debug("creating google cloud instance ", { name, configuration });

  if (configuration.acceleratorType == "nvidia-tesla-k80") {
    // it will be deprecated from google cloud soon, and nvidia's recent drivers don't work either.
    throw Error("the nvidia-tesla-k80 GPU is deprecated");
  }

  if (!sourceImage) {
    if (configuration.acceleratorType) {
      sourceImage = `projects/${client.googleProjectId}/global/images/cocalc-image-cuda-x86-20230912-142433-first-try-gpu`;
    } else {
      sourceImage = `projects/${client.googleProjectId}/global/images/cocalc-image-standard-x86-20230912-141740-try8-right-repo`;
      //       sourceImage = `projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-${
      //         configuration.machineType.startsWith("t2a-") ? "arm64-" : ""
      //       }v20230829`;
    }
  }

  const disks = [
    {
      autoDelete: true,
      boot: true,
      initializeParams: {
        diskSizeGb: `${configuration.diskSizeGb ?? 10}`,
        diskType: `projects/${client.googleProjectId}/zones/${configuration.zone}/diskTypes/pd-balanced`,
        labels: {},
        sourceImage,
      },
      mode: "READ_WRITE",
      type: "PERSISTENT",
    },
  ];

  const machineType = `zones/${configuration.zone}/machineTypes/${configuration.machineType}`;

  const networkInterfaces = [
    {
      accessConfigs: [
        {
          name: "External NAT",
          networkTier: supportsStandardNetworkTier(configuration.region)
            ? "STANDARD"
            : "PREMIUM",
        },
      ],
      stackType: "IPV4_ONLY",
      subnetwork: `projects/${client.googleProjectId}/regions/${configuration.region}/subnetworks/default`,
    },
  ];

  const configMetadata = { items: [] as { key: string; value: any }[] };
  if (metadata != null) {
    for (const key in metadata) {
      configMetadata.items.push({ key, value: metadata[key] });
    }
  }
  if (startupScript) {
    configMetadata.items.push({
      key: "startup-script",
      value: startupScript,
    });
  }

  const schedulingModel = configuration.spot
    ? {
        automaticRestart: false,
        instanceTerminationAction: "STOP",
        onHostMaintenance: "TERMINATE",
        provisioningModel: "SPOT",
      }
    : {
        automaticRestart: true,
        onHostMaintenance: !configuration.acceleratorType
          ? "MIGRATE"
          : "TERMINATE",
        provisioningModel: "STANDARD",
      };

  const maxRunDuration = configuration.maxRunDurationSeconds
    ? {
        seconds: configuration.maxRunDurationSeconds,
      }
    : undefined;
  const terminationTime = configuration.terminationTime
    ? { terminationTime: configuration.terminationTime.toISOString() }
    : undefined;

  const scheduling = {
    ...schedulingModel,
    ...maxRunDuration,
    ...terminationTime,
  };

  const guestAccelerators = !configuration.acceleratorType
    ? []
    : [
        {
          acceleratorCount: configuration.acceleratorCount ?? 1,
          acceleratorType: `projects/${client.googleProjectId}/zones/${configuration.zone}/acceleratorTypes/${configuration.acceleratorType}`,
        },
      ];

  const instanceResource = {
    name,
    disks,
    machineType,
    networkInterfaces,
    metadata: configMetadata,
    scheduling,
    guestAccelerators,
  };

  logger.debug("create instance", instanceResource);
  //console.log(JSON.stringify(instanceResource, undefined, 2));

  await client.insert({
    project: client.googleProjectId,
    zone: configuration.zone,
    instanceResource,
  });
}
