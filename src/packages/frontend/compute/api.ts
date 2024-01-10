import api from "@cocalc/frontend/client/api";
import type {
  Action,
  Configuration,
  Cloud,
  Images,
} from "@cocalc/util/db-schema/compute-servers";
import type { GoogleCloudData } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import { reuseInFlight } from "async-await-utils/hof";

export async function createServer(opts: {
  project_id: string;
  title?: string;
  color?: string;
  idle_timeout?: number;
  autorestart?: boolean;
  cloud?: Cloud;
  configuration?: Configuration;
}): Promise<number> {
  return await api("compute/create-server", opts);
}

export async function computeServerAction(opts: {
  id: number;
  action: Action;
}) {
  await api("compute/compute-server-action", opts);
}

export async function getServerState(id: number) {
  await api("compute/get-server-state", { id });
}

export async function deleteServer(id: number) {
  await api("compute/delete-server", { id });
}

export async function undeleteServer(id: number) {
  await api("compute/undelete-server", { id });
}

// only owner can change properties of a compute server.

export async function setServerColor(opts: { id: number; color: string }) {
  return await api("compute/set-server-color", opts);
}

export async function setServerTitle(opts: { id: number; title: string }) {
  return await api("compute/set-server-title", opts);
}

// server must be off
export async function setServerConfiguration(opts: {
  id: number;
  configuration: string;
}) {
  return await api("compute/set-server-configuration", opts);
}

export async function setServerCloud(opts: { id: number; cloud: string }) {
  return await api("compute/set-server-cloud", opts);
}

// Cache for 12 hours
let googleCloudPriceData: GoogleCloudData | null = null;
let googleCloudPriceDataExpire: number = 0;
export const getGoogleCloudPriceData = reuseInFlight(
  async (): Promise<GoogleCloudData> => {
    if (
      googleCloudPriceData == null ||
      Date.now() >= googleCloudPriceDataExpire
    ) {
      googleCloudPriceData = await api("compute/google-cloud/get-pricing-data");
      googleCloudPriceDataExpire = Date.now() + 1000 * 60 * 60 * 12; // 12 hour cache
    }
    if (googleCloudPriceData == null) {
      throw Error("bug");
    }
    return googleCloudPriceData;
  },
);

// Returns network usage during the given interval.  Returns
// amount in GiB and cost at our current rate.
export async function getNetworkUsage(opts: {
  id: number;
  start: Date;
  end: Date;
}): Promise<{ amount: number; cost: number }> {
  return await api("compute/get-network-usage", opts);
}

// Get the current api key for a specific (on prem) server.
// We only need this for on prem, so we are restricting to that right now.
// If no key is allocated, one will be created.
export async function getApiKey(opts: { id }): Promise<string> {
  return await api("compute/get-api-key", opts);
}
export async function deleteApiKey(opts: { id }): Promise<string> {
  return await api("compute/delete-api-key", opts);
}

// Get the project log entries directly for just one compute server
export async function getLog(opts: { id }) {
  return await api("compute/get-log", opts);
}

export const getTitle = reuseInFlight(async (opts: { id: number }) => {
  return await api("compute/get-server-title", opts);
});

// Setting a detailed state component for a compute server
export async function setDetailedState(opts: {
  project_id: string;
  id: number;
  name: string;
  state?: string;
  extra?: string;
  timeout?: number;
  progress?: number;
}) {
  return await api("compute/set-detailed-state", opts);
}

// We cache images for 1 minute.
const imagesCache: { timestamp: number; IMAGES: Images | null } = {
  timestamp: 0,
  IMAGES: null,
};

export async function getImages(): Promise<Images> {
  if (imagesCache.IMAGES && Date.now() - imagesCache.timestamp <= 60 * 1000) {
    return imagesCache.IMAGES;
  }
  try {
    imagesCache.IMAGES = await api("compute/get-images");
    imagesCache.timestamp = Date.now();
  } catch (err) {
    if (imagesCache.IMAGES) {
      console.warn(
        "ERROR getting updated compute server images -- using cached data",
        err,
      );
      // if we have cached data, just return it
      return imagesCache.IMAGES;
    }
    throw err;
  }
  if (!imagesCache.IMAGES) {
    throw Error("bug");
  }
  return imagesCache.IMAGES;
}
