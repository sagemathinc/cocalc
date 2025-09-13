import createServer from "@cocalc/server/compute/create-server";
import computeServerAction from "@cocalc/server/compute/compute-server-action";
import { getServersById } from "@cocalc/server/compute/get-servers";
import getServers from "@cocalc/server/compute/get-servers";
import { state as getServerState } from "@cocalc/server/compute/control";
import { getSerialPortOutput } from "@cocalc/server/compute/control";
import deleteServer from "@cocalc/server/compute/delete-server";
import undeleteServer from "@cocalc/server/compute/undelete-server";
import { isDnsAvailable as isDnsAvailable0 } from "@cocalc/server/compute/dns";
import setServerColor from "@cocalc/server/compute/set-server-color";
import setServerTitle from "@cocalc/server/compute/set-server-title";
import setServerConfiguration from "@cocalc/server/compute/set-server-configuration";
import { getTemplate } from "@cocalc/server/compute/templates";
import { setTemplate } from "@cocalc/server/compute/templates";
import { getTemplates } from "@cocalc/server/compute/templates";
import setServerCloud from "@cocalc/server/compute/set-server-cloud";
import setServerOwner from "@cocalc/server/compute/set-server-owner";
import getHyperstackPriceData from "@cocalc/server/compute/cloud/hyperstack/pricing-data";
import getGoogleCloudPriceData from "@cocalc/server/compute/cloud/google-cloud/pricing-data";
import { getNetworkUsage as getNetworkUsage0 } from "@cocalc/server/compute/control";
import { getEventLog as getLog } from "@cocalc/server/compute/event-log";
import { getTitle } from "@cocalc/server/compute/get-servers";
import setDetailedState from "@cocalc/server/compute/set-detailed-state";
import { getServer } from "@cocalc/server/compute/get-servers";
import {
  setProjectApiKey,
  deleteProjectApiKey,
} from "@cocalc/server/compute/project-api-key";
import { getImages } from "@cocalc/server/compute/images";
import { getAllImages as getGoogleCloudImages } from "@cocalc/server/compute/cloud/google-cloud/images";
import { setImageTested } from "@cocalc/server/compute/control";

export async function getApiKey({
  account_id,
  id,
}: {
  account_id?: string;
  id: number;
}): Promise<string> {
  if (!account_id) {
    throw Error("must be signed in");
  }
  const server = await getServer({ id, account_id });
  if (server.cloud != "onprem") {
    throw Error("getting api key is only supported for onprem compute servers");
  }
  if (server.account_id != account_id) {
    throw Error("you must be the owner of the compute server");
  }
  await deleteProjectApiKey({ account_id, server });
  return await setProjectApiKey({ account_id, server });
}

export async function deleteApiKey({
  account_id,
  id,
}: {
  account_id?: string;
  id: number;
}): Promise<void> {
  if (!account_id) {
    throw Error("must be signed in");
  }
  const server = await getServer({ id, account_id });
  if (server.account_id != account_id) {
    throw Error("you must be the owner of the compute server");
  }
  await deleteProjectApiKey({ account_id, server });
}

export async function isDnsAvailable({
  account_id,
  dns,
}: {
  account_id?: string;
  dns: string;
}): Promise<boolean> {
  if (!account_id) {
    throw Error("must be signed in");
  }
  return await isDnsAvailable0(dns);
}

export async function getNetworkUsage({ account_id, id, start, end }) {
  if (!account_id) {
    throw Error("must be signed in");
  }
  if (!start) {
    throw Error("must specify start");
  }
  if (!end) {
    throw Error("must specify end");
  }
  const server = await getServer({ account_id, id });
  return await getNetworkUsage0({
    server,
    start: new Date(start),
    end: new Date(end),
  });
}

export {
  createServer,
  computeServerAction,
  getServersById,
  getServers,
  getServerState,
  getSerialPortOutput,
  deleteServer,
  undeleteServer,
  setServerColor,
  setServerTitle,
  setServerConfiguration,
  setTemplate,
  getTemplate,
  getTemplates,
  setServerCloud,
  setServerOwner,
  getGoogleCloudPriceData,
  getHyperstackPriceData,
  getLog,
  getTitle,
  setDetailedState,
  getImages,
  getGoogleCloudImages,
  setImageTested,
};
