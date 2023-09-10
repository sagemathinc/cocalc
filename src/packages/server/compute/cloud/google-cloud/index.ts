/*
a = require('./dist/compute/create-server'); await a.default({account_id:'15143a10-43f2-48d6-b9cb-63c6111524ba',project_id:'34ce85cd-b4ad-4786-a8f0-67fa9c729b4f',cloud:'google-cloud',configuration:{machineType:'n1-standard-4',region:'us-central1',zone:'us-central1-c'',spot:true, diskSizeGb:15,cloud:'google-cloud'}})



a = require('./dist/compute/create-server'); await a.default({account_id:'15143a10-43f2-48d6-b9cb-63c6111524ba',project_id:'34ce85cd-b4ad-4786-a8f0-67fa9c729b4f',cloud:'google-cloud',configuration: {"spot": true, "zone": "us-central1-a", "cloud": "google-cloud", "region": "us-central1", "diskSizeGb": 50, "machineType": "n1-standard-2", "acceleratorType": "nvidia-tesla-t4", "acceleratorCount": 1}});


a = require('./dist/compute/create-server'); await a.default({account_id:'15143a10-43f2-48d6-b9cb-63c6111524ba',project_id:'34ce85cd-b4ad-4786-a8f0-67fa9c729b4f',cloud:'google-cloud',configuration: {"spot": true, "zone": "us-central1-a", "cloud": "google-cloud", "region": "us-central1", "machineType": "t2a-standard-2"}});

*/

import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { setData } from "@cocalc/server/compute/util";
import getClient from "./client";
import getPricingData from "./pricing-data";
import createInstance from "./create-instance";
import deleteInstance from "./delete-instance";
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
