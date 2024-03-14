import getClient from "./client";
import type { State } from "@cocalc/util/db-schema/compute-servers";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:google-cloud:get-instance");

interface Options {
  name: string;
  zone: string;
}

export default async function getInstance({ name, zone }: Options): Promise<{
  state: State;
  internalIp: string;
  externalIp: string;
  cpuPlatform: string;
  creationTimestamp?: Date;
  lastStartTimestamp?: Date;
}> {
  const client = await getClient();
  let response;
  try {
    [response] = await client.get({
      project: client.googleProjectId,
      zone,
      instance: name,
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return {
        state: "deprovisioned",
        internalIp: "",
        externalIp: "",
        cpuPlatform: "",
      } as const;
    }
    throw err;
  }
  // logger.debug("got GCP instance info", response);
  const internalIp = response?.networkInterfaces?.[0]?.networkIP ?? "";
  const externalIp = response?.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? "";

  const r = {
    name: response.name,
    state: getState(response),
    internalIp,
    externalIp,
    creationTimestamp: new Date(response.creationTimestamp),
    lastStartTimestamp: new Date(response.lastStartTimestamp),
    cpuPlatform: response.cpuPlatform,
  };
  logger.debug("got instance info", r);
  return r;
}

function getState(response): State {
  const { status } = response;
  logger.debug("got GCP status", status);
  switch (status) {
    case "PROVISIONING":
    case "STAGING":
      return "starting";
    case "RUNNING":
      return "running";
    case "STOPPING":
      return "stopping";
    case "TERMINATED":
      return "off";
    case "SUSPENDING":
      return "suspending";
    case "SUSPENDED":
      return "suspended";
    default:
      return "unknown";
  }
}
