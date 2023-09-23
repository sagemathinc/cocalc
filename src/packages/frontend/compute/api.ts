import api from "@cocalc/frontend/client/api";
import type {
  Configuration,
  Cloud,
} from "@cocalc/util/db-schema/compute-servers";
import type { GoogleCloudData } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";

export async function createServer(opts: {
  project_id: string;
  name?: string;
  color?: string;
  idle_timeout?: number;
  autorestart?: boolean;
  cloud?: Cloud;
  configuration?: Configuration;
}): Promise<number> {
  return await api("compute/create-server", opts);
}

export async function setServerColor(opts: { id: number; color: string }) {
  return await api("compute/set-server-color", opts);
}

export async function setServerTitle(opts: { id: number; title: string }) {
  return await api("compute/set-server-title", opts);
}

export async function setServerCloud(opts: { id: number; cloud: string }) {
  return await api("compute/set-server-cloud", opts);
}

// Cache for 12 hours
let googleCloudPricingData: GoogleCloudData | null = null;
let googleCloudPricingDataTime: number = 0;
export async function getGoogleCloudPricingData(): Promise<GoogleCloudData> {
  if (
    googleCloudPricingData == null ||
    Date.now() - googleCloudPricingDataTime >= 1000 * 60 * 60 * 12
  ) {
    googleCloudPricingData = await api("compute/google-cloud/get-pricing-data");
  }
  if (googleCloudPricingData == null) {
    throw Error("bug");
  }
  return googleCloudPricingData;
}
