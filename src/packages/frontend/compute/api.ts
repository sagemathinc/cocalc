import api from "@cocalc/frontend/client/api";
import type {
  Action,
  Configuration,
  Cloud,
} from "@cocalc/util/db-schema/compute-servers";
import type { GoogleCloudData } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";

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
  await api("compute/delete-server", opts);
}

export async function deleteComputeServer(id) {
  await api("compute/delete-server", { id });
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
let googleCloudPriceDataTime: number = 0;
export async function getGoogleCloudPriceData(): Promise<GoogleCloudData> {
  if (
    googleCloudPriceData == null ||
    Date.now() - googleCloudPriceDataTime >= 1000 * 60 * 60 * 12
  ) {
    googleCloudPriceData = await api("compute/google-cloud/get-pricing-data");
    if (googleCloudPriceData != null) {
      includeGpuData(googleCloudPriceData);
    }
  }
  if (googleCloudPriceData == null) {
    throw Error("bug");
  }
  return googleCloudPriceData;
}

function includeGpuData(data: GoogleCloudData) {
  data.accelerators["nvidia-a100-40gb"] = {
    count: 1,
    max: 16,
    memory: 40,
    prices: {
      "us-central1-a": 2141.75 / 730,
      "us-central1-b": 2141.75 / 730,
      "us-central1-c": 2141.75 / 730,
      "us-central1-f": 2141.75 / 730,
      "us-east1-b": 2141.75 / 730,
      "us-west1-b": 2141.75 / 730,
      "us-west3-b": 2141.75 / 730,
      "us-west4-b": 2141.75 / 730,
      "europe-west4-a": 2141.75 / 730,
      "europe-west4-b": 2141.75 / 730,
      "me-west1-b": 2355.93 / 730,
      "me-west1-c": 2355.93 / 730,
      "asia-northeast1-a": 2264.14 / 730,
      "asia-northeast1-c": 2264.14 / 730,
      "asia-northeast3-a": 2264.14 / 730,
      "asia-northeast3-b": 2264.14 / 730,
      "asia-southeast1-b": 2264.14 / 730,
      "asia-southeast1-c": 2264.14 / 730,
    },
    // @ts-ignore
    machineType: "a2-highgpu-1g",
  };
  data.accelerators["nvidia-a100-40gb"].spot = sixtyPercentOff(
    data.accelerators["nvidia-a100-40gb"].prices,
  );
  data.accelerators["nvidia-a100-80gb"] = {
    count: 1,
    max: 8,
    memory: 80,
    prices: {
      "us-east4-c": 3229.66 / 730,
      "us-east5-b": 3229.66 / 730,
      "us-central1-a": 2867.5 / 730,
      "us-central1-c": 2867.5 / 730,
      "europe-wast4-a": 3157.4 / 730,
      "asia-southeast1-c": 3537.63 / 730,
    },
    // @ts-ignore
    machineType: "a2-ultragpu-1g",
  };
  data.accelerators["nvidia-a100-80gb"].spot = sixtyPercentOff(
    data.accelerators["nvidia-a100-80gb"].prices,
  );
  delete data.accelerators["nvidia-k80"];
  for (const key in data.accelerators) {
    // @ts-ignore
    if (data.accelerators[key].machineType == null) {
      // @ts-ignore
      data.accelerators[key].machineType = "n1-";
    }
  }
}

// GPU's are in high demand, so as of Sept 25, 2023, Google
// just went to the worst possible spot instance discounts for them.
// Since we have a little trouble to get reliable data for spot A100's directly from
// google api's, we just use this (which is safe) for a100's.
// Of course a100 spot instances aren't often available!
function sixtyPercentOff(obj) {
  const obj2: any = {};
  for (const key in obj) {
    obj2[key] = 0.6 * obj[key];
  }
  return obj2;
}
