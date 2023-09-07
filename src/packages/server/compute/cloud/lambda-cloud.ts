import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { LambdaCloudAPI } from "lambda-cloud-node-api";
import getLogger from "@cocalc/backend/logger";
import { setData } from "../util";

const logger = getLogger("server:compute:lambda-cloud");

let client: null | LambdaCloudAPI = null;
async function getClient(): Promise<LambdaCloudAPI> {
  if (client != null) {
    return client;
  }
  const { lambda_cloud_api_key: apiKey } = await getServerSettings();
  if (!apiKey) {
    throw Error("lambda cloud is not supported -- no api key");
  }
  client = new LambdaCloudAPI({ apiKey });
  return client;
}

async function getAvailableInstances() {
  const client = await getClient();
  const x = await client.listInstanceTypes();
  const instances = Object.values(x)
    .filter((v) => v.regions_with_capacity_available.length > 0)
    .map((v) => {
      return { ...v.instance_type, regions: v.regions_with_capacity_available };
    });
  logger.debug("getAvailableInstances", instances);
  return instances;
}

function getServerName(server: ComputeServer) {
  return `cocalc-compute-server-${server.id}`;
}

export async function start(server: ComputeServer) {
  logger.debug("start", server);
  const instance_type_name = server.data?.instance_type_name;
  if (!instance_type_name) {
    throw Error("instance_type_name field of server data object must be set");
  }
  const region_name = await getRegion(instance_type_name);
  // TODO:
  const ssh_key_names: [string] = ["cocalc-gpu"];
  const name = getServerName(server);

  const configuration = {
    instance_type_name,
    region_name,
    ssh_key_names,
    name,
  };
  logger.debug("start", { configuration });

  const client = await getClient();
  const { instance_ids } = await client.launchInstance(configuration);
  if (instance_ids.length == 0) {
    throw Error("failed to launch any instances");
  }
  await setData(server.id, { instance_id: instance_ids[0] });
}

async function getRegion(instance_type_name: string) {
  for (const instance of await getAvailableInstances()) {
    if (instance.name == instance_type_name) {
      for (const region of instance.regions) {
        if (region.name.includes("east")) {
          return region.name;
        }
      }
      return instance.regions[0].name;
    }
  }
  throw Error("no available regions");
}

export async function stop(server: ComputeServer) {
  logger.debug("top", server);
  const instance_id = server.data?.instance_id;
  if (!instance_id) {
    return;
  }
  const client = await getClient();
  await client.terminateInstances([instance_id]);
}

export async function state(server: ComputeServer): Promise<State> {
  logger.debug("state", server);
  const instance_id = server.data?.instance_id;
  if (!instance_id) {
    return "off";
  }

  const client = await getClient();
  const instance = await client.getRunningInstance(instance_id);
  logger.debug("state", instance);
  await setData(server.id, { instance });
  if (instance.status == "booting") {
    return "starting";
  } else if (instance.status == "active") {
    return "running";
  } else if (instance.status == "terminated") {
    return "off";
  } else {
    return "unknown";
  }
}

export const test = { getClient, getAvailableInstances };
