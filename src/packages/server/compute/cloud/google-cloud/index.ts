import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { setData } from "@cocalc/server/compute/util";
import getClient, { deleteInstance } from "./client";
import getPricingData from "./pricing-data";
import createInstance from "./create-instance";
import getInstanceState from "./get-instance-state";
import startupScript from "@cocalc/server/compute/cloud/startup-script";
import computeCost from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:google-cloud");

function getServerName(server: ComputeServer) {
  return `cocalc-compute-server-${server.id}`;
}

export async function start(server: ComputeServer) {
  logger.debug("start", server);
  // make sure we can compute cost before starting
  const cost_per_hour = await cost(server);
  logger.debug("starting server with cost $", cost_per_hour, "/hour");
  const { configuration } = server;
  if (configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = getServerName(server);
  await createInstance({
    name,
    configuration,
    startupScript: startupScript({
      api_key: server.api_key,
      project_id: server.project_id,
      gpu: !!configuration.acceleratorType,
    }),
  });
  await setData(server.id, { name });
}

export async function stop(server: ComputeServer) {
  logger.debug("stop", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = server.data?.name;
  if (!name) {
    return;
  }
  await deleteInstance({ name, zone: conf.zone });
}

export async function state(server: ComputeServer): Promise<State> {
  logger.debug("state", server);
  const conf = server.configuration;
  if (conf?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const name = server.data?.name;
  if (!name) {
    return "off";
  }
  return await getInstanceState({ name, zone: conf.zone });
}

export async function cost(server: ComputeServer): Promise<number> {
  logger.debug("cost", server);
  const { configuration } = server;
  if (configuration?.cloud != "google-cloud") {
    throw Error("must have a google-cloud configuration");
  }
  const priceData = await getPricingData();
  return computeCost({ priceData, configuration });
}

export const test = { getClient };
