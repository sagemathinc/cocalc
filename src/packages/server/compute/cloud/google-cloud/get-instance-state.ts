import getClient from "./client";
import type { State } from "@cocalc/util/db-schema/compute-servers";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:google-cloud:get-instance-state");

interface Options {
  name: string;
  zone: string;
}

export default async function getInstanceState({
  name,
  zone,
}: Options): Promise<State> {
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
      return "off";
    }
  }
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
