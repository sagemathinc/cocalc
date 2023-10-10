import type {
  ComputeServer,
  State,
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
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { makeDnsChange } from "@cocalc/server/compute/dns";
import { getHostname } from "@cocalc/server/compute/control";

export * from "./validate-configuration";
export * from "./make-configuration-change";

const logger = getLogger("server:compute:google-cloud");

export async function getGoogleCloudPrefix() {
  const { google_cloud_compute_servers_prefix = "cocalc-compute-server" } =
    await getServerSettings();
  return google_cloud_compute_servers_prefix;
}

export async function getServerName(server: { id: number }) {
  const prefix = await getGoogleCloudPrefix();
  return `${prefix}-${server.id}`;
}

export function getStartupParams(server: ComputeServer) {
  const { configuration } = server;
  if (configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  return {
    project_id: server.project_id,
    gpu: !!configuration.acceleratorType,
    arch: getArchitecture(configuration.machineType),
    image: configuration.image ?? "minimal",
  };
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
  const name = await getServerName(server);

  if (currentState == "deprovisioned") {
    // create it
    const { diskSizeGb } = await createInstance({
      name,
      configuration,
      startupScript: await startupScript({
        compute_server_id: server.id,
        api_key: server.api_key,
        hostname: await getHostname(server.id),
        ...getStartupParams(server),
      }),
      metadata: { "serial-port-logging-enable": true },
      wait: true,
    });
    if (configuration.diskSizeGb != diskSizeGb) {
      // update config to reflect actual disk size used, so pricing matches this.
      await setConfiguration(server.id, { ...configuration, diskSizeGb });
    }
  } else {
    // start it
    await startInstance({ name, zone: configuration.zone, wait: true });
  }
  await setData({ id: server.id, data: { name }, cloud: "google-cloud" });
}

export async function reboot(server: ComputeServer) {
  logger.debug("reboot", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = await getServerName(server);
  await rebootInstance({ name, zone: conf.zone, wait: true });
}

export async function deprovision(server: ComputeServer) {
  logger.debug("deprovision", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = await getServerName(server);
  await deleteInstance({ name, zone: conf.zone, wait: true });
}

export async function stop(server: ComputeServer) {
  logger.debug("stop", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = await getServerName(server);
  await stopInstance({ name, zone: conf.zone, wait: true });
}

export async function state(server: ComputeServer): Promise<State> {
  logger.debug("state", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = await getServerName(server);
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
  if (
    server.configuration.dns &&
    (instance.state == "running" || instance.state == "deprovisioned")
  ) {
    // We only mess with DNS when the instance is running (in which case we make sure it is properly set),
    // or the instance is deprovisioned, in which case we delete the DNS.
    // In all other cases, we just leave it alone.  It turns out if you delete the DNS record
    // whenever the machine stops, it can often take a very long time after you create the
    // record for clients to become aware of it again, which is very annoying.
    // TODO: we may want to change dns records for off machines to point to some special
    // status page (?).
    (async () => {
      try {
        await makeDnsChange({
          id: server.id,
          cloud: server.cloud,
          name: instance.state == "running" ? server.configuration.dns : "",
        });
      } catch (err) {
        logger.debug("WARNING -- issue setting dns", err);
      }
    })();
  }

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
  const name = await getServerName(server);
  await suspendInstance({ name, zone: conf.zone, wait: true });
}

export async function resume(server: ComputeServer) {
  logger.debug("resume", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = await getServerName(server);
  await resumeInstance({ name, zone: conf.zone, wait: true });
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
  const instanceName = await getServerName(server);
  const amount = await getInstanceEgress({ instanceName, start, end });
  return { cost: computeNetworkCost(amount), amount };
}
