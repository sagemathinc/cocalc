import type {
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
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type Compute } from "@cocalc/conat/hub/api/compute";

function compute(): Compute {
  return webapp_client.conat_client.hub.compute;
}

export async function createServer(opts): Promise<number> {
  return await compute().createServer(opts);
}

export async function computeServerAction(opts): Promise<void> {
  await compute().computeServerAction(opts);
}

export async function getServersById(
  opts,
): Promise<Partial<ComputeServerUserInfo>[]> {
  return await compute().getServersById(opts);
}

export async function getServers(opts): Promise<ComputeServerUserInfo[]> {
  return await compute().getServers(opts);
}

export async function getServerState(
  id: number,
): Promise<ComputeServerUserInfo["state"]> {
  return await compute().getServerState({ id });
}

export async function getSerialPortOutput(id: number): Promise<string> {
  return await compute().getSerialPortOutput({ id });
}

export async function deleteServer(id: number) {
  return await compute().deleteServer({ id });
}

export async function isDnsAvailable(dns: string) {
  return await compute().isDnsAvailable({ dns });
}

export async function undeleteServer(id: number) {
  return await compute().undeleteServer({ id });
}

// only owner can change properties of a compute server.

export async function setServerColor(opts: { id: number; color: string }) {
  await compute().setServerColor(opts);
}

export async function setServerTitle(opts: { id: number; title: string }) {
  await compute().setServerTitle(opts);
}

export async function setServerConfiguration(opts: {
  id: number;
  configuration: Partial<Configuration>;
}) {
  await compute().setServerConfiguration(opts);
}

// only for admins!
export async function setTemplate(opts: {
  id: number;
  template: ComputeServerTemplate;
}) {
  await compute().setTemplate(opts);
}

// 5-minute client side ttl cache of all and specific template, since
// templates change rarely.

const templatesCache = new TTL({ ttl: 60 * 1000 * 5 });

export async function getTemplate(id: number): Promise<ConfigurationTemplate> {
  if (templatesCache.has(id)) {
    return templatesCache.get(id)!;
  }
  const x = await compute().getTemplate({ id });
  templatesCache.set(id, x);
  return x;
}

export async function getTemplates(): Promise<ConfigurationTemplates> {
  if (templatesCache.has("templates")) {
    return templatesCache.get("templates")!;
  }
  const x = await compute().getTemplates();
  templatesCache.set("templates", x);
  return x;
}

export async function setServerCloud(opts: { id: number; cloud: string }) {
  await compute().setServerCloud(opts);
}

export async function setServerOwner(opts: {
  id: number;
  new_account_id: string;
}) {
  await compute().setServerOwner(opts);
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
      googleCloudPriceData = await compute().getGoogleCloudPriceData();
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
      hyperstackPriceData = await compute().getHyperstackPriceData();
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
  return await compute().getNetworkUsage(opts);
}

// Get the current api key for a specific (on prem) server.
// We only need this for on prem, so we are restricting to that right now.
// If no key is allocated, one will be created.
export async function getApiKey(opts: { id }): Promise<string> {
  return await compute().getApiKey(opts);
}
export async function deleteApiKey(opts: { id }): Promise<void> {
  await compute().deleteApiKey(opts);
}

// Get the project log entries directly for just one compute server
export async function getLog(opts: { id; type: "activity" | "files" }) {
  return await compute().getLog(opts);
}

export const getTitle = reuseInFlight(
  async (opts: {
    id: number;
  }): Promise<{
    title: string;
    color: string;
    project_specific_id: number;
  }> => {
    return await compute().getTitle(opts);
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
  await compute().setDetailedState(opts);
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
    let images;
    if (endpoint == "compute/get-images") {
      images = await compute().getImages({ noCache: !!reload });
    } else if (endpoint == "compute/get-images-google") {
      images = await compute().getGoogleCloudImages({ noCache: !!reload });
    } else {
      throw Error(`unknown endpoint ${endpoint}`);
    }
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
  await compute().setImageTested(opts);
}
