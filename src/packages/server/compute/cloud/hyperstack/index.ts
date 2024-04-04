import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import getLogger from "@cocalc/backend/logger";
import getPricingData from "./pricing-data";
import computeCost from "@cocalc/util/compute/cloud/hyperstack/compute-cost";

const logger = getLogger("server:compute:hyperstack");
logger.debug("hi");

export async function start(server: ComputeServer) {
  console.log(server);
  throw Error("not implemented");
}

export async function stop(server: ComputeServer) {
  console.log(server);
  throw Error("not implemented");
}

export async function state(server: ComputeServer): Promise<State> {
  logger.debug("state", server);
  const conf = server.configuration;
  if (conf?.cloud != "hyperstack") {
    throw Error("must have a hyperstack configuration");
  }
  return "deprovisioned";
}

export async function cost(
  server: ComputeServer,
  state: State,
): Promise<number> {
  logger.debug("cost", server);
  const { configuration } = server;
  if (configuration?.cloud != "hyperstack") {
    throw Error("must have a hyperstack configuration");
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
