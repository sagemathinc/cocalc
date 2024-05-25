import type { GoogleCloudConfiguration } from "@cocalc/util/db-schema/compute-servers";
import getClient, { waitUntilOperationComplete } from "./client";
import getLogger from "@cocalc/backend/logger";
import { supportsStandardNetworkTier } from "./util";
import { getSourceImage } from "./images";
import {
  DEFAULT_HYPERDISK_BALANCED_IOPS,
  DEFAULT_HYPERDISK_BALANCED_THROUGHPUT,
} from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import {
  ensureDefaultFirewallsExists,
  getDefaultFirewallTags,
} from "./firewall";

const logger = getLogger("server:compute:google-cloud:create-instance");

interface Options {
  name: string;
  configuration: GoogleCloudConfiguration;
  startupScript?: string;
  sourceImage?: string;
  metadata?: object;
  wait?: boolean;
}

export default async function createInstance({
  configuration,
  name,
  startupScript,
  sourceImage,
  metadata,
  wait,
}: Options) {
  if (configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const client = await getClient();
  logger.debug("creating google cloud instance ", { name, configuration });

  if (sourceImage == null && configuration.sourceImage) {
    sourceImage = configuration.sourceImage;
  }

  if ((configuration.acceleratorType as string) == "nvidia-tesla-k80") {
    // it will be deprecated from google cloud soon, and nvidia's recent drivers don't work either.
    throw Error("the nvidia-tesla-k80 GPU is deprecated");
  }

  const { disks, diskSizeGb } = await getDisks(
    configuration,
    client,
    sourceImage,
  );

  const machineType = getFullMachineType(configuration);

  const { networkInterfaces, tags } = await getNetworkInterfaces(
    configuration,
    client,
  );

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

  const schedulingModel = getSchedulingModel(configuration);

  const advancedMachineFeatures = getAdvancedMachineFeatures(configuration);

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

  const guestAccelerators = getGuestAccelerators(configuration, client);

  const instanceResource = {
    name,
    disks,
    machineType,
    networkInterfaces,
    metadata: configMetadata,
    scheduling,
    guestAccelerators,
    tags,
    advancedMachineFeatures,
  };

  logger.debug("create instance", instanceResource);
  //console.log(JSON.stringify(instanceResource, undefined, 2));

  const [response] = await client.insert({
    project: client.googleProjectId,
    zone: configuration.zone,
    instanceResource,
  });
  if (wait) {
    logger.debug("create instance -- waiting for instance to be created...");
    await waitUntilOperationComplete({ response, zone: configuration.zone });
    logger.debug("create instance -- finished creating instance");
  }

  return { diskSizeGb };
}

export function getFullMachineType(
  configuration: GoogleCloudConfiguration,
): string {
  if (
    configuration.machineType.startsWith("g2-") &&
    !configuration.acceleratorType
  ) {
    // Critical to check this, or we might charge vastly less than we should,
    // since instead of throwing an error, the GCP api "helpfully" just
    // tosses in an expensive L4 GPU. Similar below.
    throw Error("machine type g2- MUST have a GPU attached");
  }

  if (
    configuration.machineType.startsWith("a2-") &&
    !configuration.acceleratorType
  ) {
    throw Error("machine type a2- MUST have a GPU attached");
  }

  return `zones/${configuration.zone}/machineTypes/${configuration.machineType}`;
}

export function getGuestAccelerators(
  configuration: GoogleCloudConfiguration,
  client,
) {
  if (!configuration.acceleratorType) {
    return [];
  }
  return [
    {
      acceleratorCount: Math.max(1, configuration.acceleratorCount ?? 1),
      acceleratorType: `projects/${client.googleProjectId}/zones/${configuration.zone}/acceleratorTypes/${configuration.acceleratorType}`,
    },
  ];
}

async function getNetworkInterfaces(configuration, client) {
  // Make sure the default firewalls exist.  Otherwise, ssh/http/vpn, etc., to the
  // VM won't work.
  await ensureDefaultFirewallsExists();

  const networkTier = supportsStandardNetworkTier(configuration.region)
    ? "STANDARD"
    : "PREMIUM";
  const subnetwork = `projects/${client.googleProjectId}/regions/${configuration.region}/subnetworks/default`;

  // If externalIp is not set at all, we default to true.
  // **Without externalIp, compute servers do NOT work at all since they
  // can't connect to the outside world.**
  const networkInterfaces = [
    {
      accessConfigs:
        configuration.externalIp ?? true
          ? [
              {
                name: "External NAT",
                networkTier,
              },
            ]
          : [],
      stackType: "IPV4_ONLY",
      subnetwork,
    },
  ];

  const tags = configuration.externalIp
    ? {
        items: await getDefaultFirewallTags(),
      }
    : undefined;

  return { networkInterfaces, tags };
}

async function getDisks(
  configuration: GoogleCloudConfiguration,
  client,
  sourceImage,
) {
  let diskSizeGb = 10;
  if (!sourceImage) {
    ({ diskSizeGb, sourceImage } = await getSourceImage(configuration));
  }

  diskSizeGb = Math.max(diskSizeGb, configuration.diskSizeGb ?? diskSizeGb);
  const disks = [
    {
      autoDelete: true,
      boot: true,
      initializeParams: {
        diskSizeGb: `${diskSizeGb}`,
        diskType: `projects/${client.googleProjectId}/zones/${
          configuration.zone
        }/diskTypes/${configuration.diskType ?? "pd-standard"}`,
        labels: {},
        sourceImage,
        ...getHyperdiskParams(configuration),
      },
      mode: "READ_WRITE",
      type: "PERSISTENT",
    },
  ];

  return { disks, diskSizeGb };
}

function getHyperdiskParams(configuration: GoogleCloudConfiguration) {
  if (!configuration.diskType?.includes("hyperdisk")) {
    return undefined;
  }
  return {
    provisionedIops: `${
      configuration.hyperdiskBalancedIops ?? DEFAULT_HYPERDISK_BALANCED_IOPS
    }`,
    provisionedThroughput: `${
      configuration.hyperdiskBalancedThroughput ??
      DEFAULT_HYPERDISK_BALANCED_THROUGHPUT
    }`,
  };
}

export function getSchedulingModel(configuration: GoogleCloudConfiguration) {
  if (configuration.spot) {
    return {
      automaticRestart: false,
      instanceTerminationAction: "STOP",
      localSsdRecoveryTimeout: null,
      locationHint: null,
      nodeAffinities: null,
      onHostMaintenance: "TERMINATE",
      preemptible: true,
      provisioningModel: "SPOT",
    };
  } else {
    return {
      automaticRestart: true,
      instanceTerminationAction: "START",
      localSsdRecoveryTimeout: null,
      locationHint: null,
      nodeAffinities: null,
      onHostMaintenance: !configuration.acceleratorType
        ? "MIGRATE"
        : "TERMINATE",
      provisioningModel: "STANDARD",
      preemptible: false,
    };
  }
}

function getAdvancedMachineFeatures(configuration) {
  if (configuration.enableNestedVirtualization) {
    return { enableNestedVirtualization: true };
  } else {
    return {};
  }
}
