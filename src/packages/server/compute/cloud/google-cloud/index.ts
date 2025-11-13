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
  setMetadata,
  getSerialPortOutput as getSerialPortOutput0,
} from "./client";
import getPricingData from "./pricing-data";
import createInstance from "./create-instance";
import getInstance from "./get-instance";
import { startupScriptViaApi } from "@cocalc/server/compute/cloud/startup-script";
import computeCost, {
  computeNetworkCost,
} from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import getLogger from "@cocalc/backend/logger";
import { getArchitecture, setTested } from "./images";
import { getInstanceDataTransferOut } from "./monitoring";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { delay } from "awaiting";

export * from "./validate-configuration";
export * from "./make-configuration-change";

const logger = getLogger("server:compute:google-cloud");

export async function getGoogleCloudPrefix() {
  const { google_cloud_compute_servers_prefix = "cocalc-compute-server" } =
    await getServerSettings();
  return google_cloud_compute_servers_prefix;
}

export async function getGoogleCloudImagePrefix() {
  const { google_cloud_compute_servers_image_prefix = "cocalc-image" } =
    await getServerSettings();
  return google_cloud_compute_servers_image_prefix;
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
  if (!server.api_key) {
    throw Error("api_key must be set");
  }
  const currentState = await state(server);
  const name = await getServerName(server);
  const startup = await startupScriptViaApi({
    compute_server_id: server.id,
    api_key: server.api_key,
  });

  if (currentState == "deprovisioned") {
    // create it
    if (!server.api_key) {
      throw Error(`server ${server.id}'s api_key must be set`);
    }
    const { diskSizeGb } = await createInstance({
      name,
      configuration,
      startupScript: startup,
      metadata: { "serial-port-logging-enable": true },
      wait: true,
    });
    if (configuration.diskSizeGb != diskSizeGb) {
      // update config to reflect actual disk size used, so pricing matches this.
      await setConfiguration(server.id, { ...configuration, diskSizeGb });
    }
  } else {
    // set startup script - it's critical to set this first, because it has
    // the latest api-key, and the api key that was used when the VM was created
    // could have expired or been deleted.
    await setMetadata({
      name,
      zone: configuration.zone,
      wait: true,
      metadata: { "startup-script": startup },
    });
    // then start it
    await startInstance({ name, zone: configuration.zone, wait: true });
  }
  await setData({ id: server.id, data: { name }, cloud: "google-cloud" });
  await waitForIp({
    name,
    zone: configuration.zone,
    id: server.id,
    maxTime: 10 * 60 * 1000,
  });
}

async function waitForIp({ name, zone, id, maxTime }) {
  // finally ensure we have ip address -- should not take long at a
  let d = 3000;
  const end = Date.now() + maxTime;
  while (Date.now() < end) {
    try {
      const instance = await getInstance({ name, zone });
      const externalIp = instance?.externalIp;
      logger.debug("waitForIp: waiting for ip address: got", externalIp);
      await setData({
        id,
        data: instance,
        cloud: "google-cloud",
      });
      if (externalIp) {
        return;
      }
    } catch (err) {
      logger.debug(`waitForIp: error making api call: ${err}`);
    }
    d = Math.min(30000, d * 1.3);
    await delay(d);
  }
  throw Error(`failed to get ip address for id = ${id}`);
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
  const amount = await getInstanceDataTransferOut({ instanceName, start, end });
  return { cost: computeNetworkCost(amount), amount };
}

export async function setImageTested(server: ComputeServer, tested: boolean) {
  const { configuration } = server;
  if (configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  await setTested(configuration, tested);
}

export async function getSerialPortOutput(
  server: ComputeServer,
): Promise<string> {
  const { configuration } = server;
  if (configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = await getServerName(server);
  const { zone } = configuration;
  return await getSerialPortOutput0({ name, zone });
}
