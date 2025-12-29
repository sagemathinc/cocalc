import type {
  ComputeServer,
  LambdaCloudData,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { LambdaCloudAPI } from "lambda-cloud-node-api";
import { setData } from "../util";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:lambda");

let client: null | LambdaCloudAPI = null;
async function getClient(): Promise<LambdaCloudAPI> {
  if (client != null) {
    return client;
  }
  // @ts-ignore -- temporary because I commented out the lambda cloud typings
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
  if (server.configuration?.cloud != "lambda") {
    throw Error("must have a lambda configuration");
  }
  // TODO:
  const ssh_key_names: [string] = ["cocalc-gpu"];
  const name = getServerName(server);

  const configuration = {
    ...server.configuration,
    ssh_key_names,
    name,
  };
  logger.debug("start", { configuration });

  const client = await getClient();
  const { instance_ids } = await client.launchInstance(configuration);
  if (instance_ids.length == 0) {
    throw Error("failed to launch any instances");
  }

  await setData({
    id: server.id,
    data: { instance_id: instance_ids[0] },
    cloud: "lambda",
  });
}

export async function stop(server: ComputeServer) {
  logger.debug("top", server);
  const instance_id = (server.data as LambdaCloudData | undefined)?.instance_id;
  if (!instance_id) {
    return;
  }
  const client = await getClient();
  await client.terminateInstances([instance_id]);
}

export async function state(server: ComputeServer): Promise<State> {
  logger.debug("state", server);
  const instance_id = (server.data as LambdaCloudData | undefined)?.instance_id;
  if (!instance_id) {
    return "off";
  }

  const client = await getClient();
  const instance = await client.getRunningInstance(instance_id);
  logger.debug("state", instance);
  await setData({
    id: server.id,
    data: { instance_id: instance.id },
    cloud: "lambda",
  });

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

export async function cost(
  server: ComputeServer,
  state: State,
): Promise<number> {
  logger.debug("cost", server, state);
  throw Error("not implemented");
}

export const test = { getClient, getAvailableInstances };
