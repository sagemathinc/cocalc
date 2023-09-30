import type {
  ComputeServer,
  State,
  GoogleCloudData,
} from "@cocalc/util/db-schema/compute-servers";
import { setConfiguration, setData } from "@cocalc/server/compute/util";
import getClient, {
  deleteInstance,
  rebootInstance,
  startInstance,
  stopInstance,
  suspendInstance,
  resumeInstance,
} from "./client";
import getPricingData from "./pricing-data";
import createInstance from "./create-instance";
import getInstance from "./get-instance";
import startupScript from "@cocalc/server/compute/cloud/startup-script";
import computeCost, {
  computeNetworkCost,
} from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import getLogger from "@cocalc/backend/logger";
import { getArchitecture } from "./images";
import { getInstanceEgress } from "./monitoring";

export * from "./validate-configuration";

const logger = getLogger("server:compute:google-cloud");

function getServerName(server: ComputeServer) {
  return `cocalc-compute-server-${server.id}`;
}

export async function start(server: ComputeServer) {
  logger.debug("start", server);
  // make sure we can compute cost before starting
  const cost_per_hour = await cost(server, "running");
  logger.debug("starting server with cost $", cost_per_hour, "/hour");
  const { configuration } = server;
  if (configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const currentState = await state(server);
  const name = getServerName(server);

  if (currentState == "deprovisioned") {
    // create it
    const { diskSizeGb } = await createInstance({
      name,
      configuration,
      startupScript: startupScript({
        api_key: server.api_key,
        project_id: server.project_id,
        gpu: !!configuration.acceleratorType,
        arch: getArchitecture(configuration.machineType),
        hostname: `compute-server-${server.id}`,
      }),
      metadata: { "serial-port-logging-enable": true },
    });
    if (configuration.diskSizeGb != diskSizeGb) {
      // update config to reflect actual disk size used, so pricing matches this.
      await setConfiguration(server.id, { ...configuration, diskSizeGb });
    }
  } else {
    // start it
    await startInstance({ name, zone: configuration.zone });
  }
  await setData({ id: server.id, data: { name }, cloud: "google-cloud" });
}

export async function reboot(server: ComputeServer) {
  logger.debug("reboot", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = (server.data as GoogleCloudData | undefined)?.name;
  if (!name) {
    return;
  }
  await rebootInstance({ name, zone: conf.zone });
}

export async function deprovision(server: ComputeServer) {
  logger.debug("deprovision", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = (server.data as GoogleCloudData | undefined)?.name;
  if (!name) {
    return;
  }
  await deleteInstance({ name, zone: conf.zone });
}

export async function stop(server: ComputeServer) {
  logger.debug("stop", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = (server.data as GoogleCloudData | undefined)?.name;
  if (!name) {
    return;
  }
  await stopInstance({ name, zone: conf.zone });
}

export async function state(server: ComputeServer): Promise<State> {
  logger.debug("state", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = (server.data as GoogleCloudData | undefined)?.name;
  if (!name) {
    return "deprovisioned";
  }
  const instance = await getInstance({ name, zone: conf.zone });
  (async () => {
    try {
      await setData({
        id: server.id,
        data: instance,
        cloud: "google-cloud",
      });
    } catch (err) {
      logger.debug("WARNING -- issue saving data about instance", err);
    }
  })();
  return instance.state;
}

export async function cost(
  server: ComputeServer,
  state: State,
): Promise<number> {
  logger.debug("cost", server);
  const { configuration } = server;
  if (configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  if (state == "deprovisioned") {
    return 0;
  }
  const priceData = await getPricingData();
  // we  need to handle the stable target states except 'deprovisioned'
  switch (state) {
    case "off":
    case "running":
    case "suspended":
      return computeCost({ priceData, configuration, state });
    default:
      throw Error(`cost computation for state '${state}' not implemented`);
  }
}

export const test = { getClient };

export async function suspend(server: ComputeServer) {
  logger.debug("suspend", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = (server.data as GoogleCloudData | undefined)?.name;
  if (!name) {
    return;
  }
  await suspendInstance({ name, zone: conf.zone });
}

export async function resume(server: ComputeServer) {
  logger.debug("resume", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = (server.data as GoogleCloudData | undefined)?.name;
  if (!name) {
    return;
  }
  await resumeInstance({ name, zone: conf.zone });
}

export async function getNetworkUsage({
  server,
  start,
  end,
}: {
  server: ComputeServer;
  start: Date;
  end: Date;
}) {
  const instanceName = getServerName(server);
  const amount = await getInstanceEgress({ instanceName, start, end });
  return { cost: computeNetworkCost(amount), amount };
}
