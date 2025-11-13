import api from "@cocalc/frontend/client/api";
import type {
  Action,
  Cloud,
  ComputeServerTemplate,
  ComputeServerUserInfo,
  Configuration,
  Images,
  GoogleCloudImages,
} from "@cocalc/util/db-schema/compute-servers";
import type { GoogleCloudData } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import type { HyperstackPriceData } from "@cocalc/util/compute/cloud/hyperstack/pricing";
import type {
  ConfigurationTemplate,
  ConfigurationTemplates,
} from "@cocalc/util/compute/templates";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import TTL from "@isaacs/ttlcache";

export async function createServer(opts: {
  project_id: string;
  title?: string;
  color?: string;
  autorestart?: boolean;
  cloud?: Cloud;
  configuration?: Configuration;
  notes?: string;
  course_project_id?: string;
  course_server_id?: number;
}): Promise<number> {
  return await api("compute/create-server", opts);
}

export async function computeServerAction(opts: {
  id: number;
  action: Action;
}) {
  await api("compute/compute-server-action", opts);
}

// Get servers across potentially different projects by their global unique id.
// Use the fields parameter to restrict to a much smaller subset of information
// about each server (e.g., just the state field).  Caller must be a collaborator
// on each project containing the servers.
// If you give an id of a server that doesn't exist, it'll just be excluded in the result.
// Similarly, if you give a field that doesn't exist, it is excluded.
// The order of the returned servers and count probably will NOT match that in
// ids, so you should include 'id' in fields.
export async function getServersById(opts: {
  ids: number[];
  fields?: string[];
}): Promise<Partial<ComputeServerUserInfo>[]> {
  return await api("compute/get-servers-by-id", opts);
}

export async function getServers(opts: {
  id?: number;
  project_id: string;
}): Promise<ComputeServerUserInfo[]> {
  return await api("compute/get-servers", opts);
}

export async function getServerState(id: number) {
  return await api("compute/get-server-state", { id });
}

export async function getSerialPortOutput(id: number) {
  return await api("compute/get-serial-port-output", { id });
}

export async function deleteServer(id: number) {
  return await api("compute/delete-server", { id });
}

export async function isDnsAvailable(dns: string) {
  const { isAvailable } = await api("compute/is-dns-available", { dns });
  return isAvailable;
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

export async function setServerConfiguration(opts: {
  id: number;
  configuration: Partial<Configuration>;
}) {
  return await api("compute/set-server-configuration", opts);
}

// only for admins!
export async function setTemplate(opts: {
  id: number;
  template: ComputeServerTemplate;
}) {
  return await api("compute/set-template", opts);
}

// 5-minute client side ttl cache of all and specific template, since
// templates change rarely.

const templatesCache = new TTL({ ttl: 60 * 1000 * 5 });

export async function getTemplate(id: number): Promise<ConfigurationTemplate> {
  if (templatesCache.has(id)) {
    return templatesCache.get(id)!;
  }
  const x = await api("compute/get-template", { id });
  templatesCache.set(id, x);
  return x;
}

export async function getTemplates(): Promise<ConfigurationTemplates> {
  if (templatesCache.has("templates")) {
    return templatesCache.get("templates")!;
  }
  const x = await api("compute/get-templates");
  templatesCache.set("templates", x);
  return x;
}

export async function setServerCloud(opts: { id: number; cloud: string }) {
  return await api("compute/set-server-cloud", opts);
}

export async function setServerOwner(opts: {
  id: number;
  new_account_id: string;
}) {
  return await api("compute/set-server-owner", opts);
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

import { useState, useEffect } from "react";
export function useGoogleCloudPriceData() {
  const [priceData, setPriceData] = useState<null | GoogleCloudData>(null);
  const [error, setError] = useState<string>("");
  useEffect(() => {
    (async () => {
      try {
        setError("");
        setPriceData(await getGoogleCloudPriceData());
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, []);
  return [priceData, error];
}

// Cache for 5 minutes -- cache less since this includes realtime
// information about GPU availability.
let hyperstackPriceData: HyperstackPriceData | null = null;
let hyperstackPriceDataExpire: number = 0;
export const getHyperstackPriceData = reuseInFlight(
  async (): Promise<HyperstackPriceData> => {
    if (
      hyperstackPriceData == null ||
      Date.now() >= hyperstackPriceDataExpire
    ) {
      hyperstackPriceData = await api("compute/get-hyperstack-pricing-data");
      hyperstackPriceDataExpire = Date.now() + 1000 * 60 * 5; // 5 minute cache
    }
    if (hyperstackPriceData == null) {
      throw Error("bug");
    }
    return hyperstackPriceData;
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
export async function getLog(opts: { id; type: "activity" | "files" }) {
  return await api("compute/get-log", opts);
}

export const getTitle = reuseInFlight(
  async (opts: {
    id: number;
  }): Promise<{
    title: string;
    color: string;
    project_specific_id: number;
  }> => {
    return await api("compute/get-server-title", opts);
  },
);

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

// We cache images for 5 minutes.
const IMAGES_TTL = 5 * 60 * 1000;

const imagesCache: {
  [cloud: string]: { timestamp: number; images: Images | null };
} = {};

function cacheHas(cloud: string) {
  const x = imagesCache[cloud];
  if (x == null) {
    return false;
  }
  if (Math.abs(x.timestamp - Date.now()) <= IMAGES_TTL) {
    return true;
  }
  return false;
}

function cacheGet(cloud) {
  return imagesCache[cloud]?.images;
}

function cacheSet(cloud, images) {
  imagesCache[cloud] = { images, timestamp: Date.now() };
}

async function getImagesFor({
  cloud,
  endpoint,
  reload,
}: {
  cloud: string;
  endpoint: string;
  reload?: boolean;
}): Promise<any> {
  if (!reload && cacheHas(cloud)) {
    return cacheGet(cloud);
  }

  try {
    const images = await api(
      endpoint,
      // admin reload forces fetch data from github and/or google cloud - normal users just have their cache ignored above
      reload ? { noCache: true } : undefined,
    );
    cacheSet(cloud, images);
    return images;
  } catch (err) {
    const images = cacheGet(cloud);
    if (images != null) {
      console.warn(
        "ERROR getting updated compute server images -- using cached data",
        err,
      );
      return images;
    }
    throw err;
  }
}

export async function getImages(reload?: boolean): Promise<Images> {
  return await getImagesFor({
    cloud: "",
    endpoint: "compute/get-images",
    reload,
  });
}

export async function getGoogleCloudImages(
  reload?: boolean,
): Promise<GoogleCloudImages> {
  return await getImagesFor({
    cloud: "google",
    endpoint: "compute/get-images-google",
    reload,
  });
}

export async function setImageTested(opts: {
  id: number; // server id
  tested: boolean;
}) {
  return await api("compute/set-image-tested", opts);
}
