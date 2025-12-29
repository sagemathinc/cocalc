/*
Defaults and configuration for clouds.

For the SVG url links:

# Step 1: Download the SVG -- using bash

curl -o mark.svg https://console.hyperstack.cloud/hyperstack-wordmark.svg

# Step 2: URL-encode the SVG content -- using python

from urllib.parse import quote
print(quote(open('mark.svg', 'r').read()))

*/

import type {
  Cloud,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";

import {
  DEFAULT_REGION as DEFAULT_HYPERSTACK_REGION,
  DEFAULT_FLAVOR as DEFAULT_HYPERSTACK_FLAVOR,
  DEFAULT_DISK as DEFAULT_HYPERSTACK_DISK,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";

// I think it could be very confusing to have anything
// here by default, since most people won't even know
// about excludes, and will just think sync is broken
// if a random default folder is excluded!
const DEFAULT_EXCLUDE_FROM_SYNC = [] as const;

const GCLOUD_SPOT_DEFAULT = false;

export const GOOGLE_CLOUD_DEFAULTS = {
  cpu: {
    image: "python",
    cloud: "google-cloud",
    region: "us-east5",
    zone: "us-east5-a",
    machineType: "n2d-highmem-2",
    spot: GCLOUD_SPOT_DEFAULT,
    diskSizeGb: 10,
    diskType: "pd-balanced",
    externalIp: true,
    excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
  },
  gpu: {
    image: "pytorch",
    spot: GCLOUD_SPOT_DEFAULT,
    region: "asia-northeast1",
    cloud: "google-cloud",
    zone: "asia-northeast1-a",
    diskType: "pd-balanced",
    diskSizeGb: 60,
    externalIp: true,
    machineType: "n1-highmem-2",
    acceleratorType: "nvidia-tesla-t4",
    acceleratorCount: 1,
    excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
  },
  gpu2: {
    image: "pytorch",
    spot: GCLOUD_SPOT_DEFAULT,
    zone: "us-central1-b",
    cloud: "google-cloud",
    region: "us-central1",
    diskType: "pd-balanced",
    diskSizeGb: 60,
    externalIp: true,
    machineType: "g2-standard-4",
    acceleratorType: "nvidia-l4",
    acceleratorCount: 1,
    excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
  },
} as const;

export const ON_PREM_DEFAULTS = {
  cpu: {
    image: "python",
    gpu: false,
    cloud: "onprem",
    excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
  },
  gpu: {
    image: "pytorch",
    gpu: true,
    cloud: "onprem",
    excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
  },
};

interface CloudInfo {
  name: Cloud;
  label: string;
  icon?: string;
  image?: string;
  defaultConfiguration: Configuration;
}

// The ones that are at all potentially worth exposing to users.
const CLOUDS: {
  [short: string]: CloudInfo;
} = {
  google: {
    name: "google-cloud",
    icon: "google",
    label: "Google Cloud Platform",
    // image url https://www.gstatic.com/devrel-devsite/prod/v0e0f589edd85502a40d78d7d0825db8ea5ef3b99ab4070381ee86977c9168730/cloud/images/cloud-logo.svg
    image: `data:image/svg+xml;utf8,%3Csvg%20id%3D%22Google_Cloud_logo%22%20data-name%3D%22Google%20Cloud%20logo%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20138.35%2024%22%3E%3Cpath%20d%3D%22M89.75%2C18.62A8.36%2C8.36%2C0%2C0%2C1%2C81.2%2C10%2C8.33%2C8.33%2C0%2C0%2C1%2C83.63%2C3.9a8.25%2C8.25%2C0%2C0%2C1%2C6.12-2.48%2C7.62%2C7.62%2C0%2C0%2C1%2C6%2C2.69L94.28%2C5.58a5.64%2C5.64%2C0%2C0%2C0-4.53-2.14%2C6.22%2C6.22%2C0%2C0%2C0-4.57%2C1.84A6.38%2C6.38%2C0%2C0%2C0%2C83.36%2C10a6.38%2C6.38%2C0%2C0%2C0%2C1.82%2C4.74%2C6.18%2C6.18%2C0%2C0%2C0%2C4.57%2C1.84%2C6.44%2C6.44%2C0%2C0%2C0%2C5-2.42l1.54%2C1.5a8%2C8%2C0%2C0%2C1-2.87%2C2.17A8.67%2C8.67%2C0%2C0%2C1%2C89.75%2C18.62ZM100.12%2C1.79V18.26H98V1.79Zm1.82%2C10.83a6%2C6%2C0%2C0%2C1%2C1.64-4.3%2C5.57%2C5.57%2C0%2C0%2C1%2C4.16-1.7%2C5.51%2C5.51%2C0%2C0%2C1%2C4.14%2C1.7%2C5.92%2C5.92%2C0%2C0%2C1%2C1.65%2C4.3%2C5.87%2C5.87%2C0%2C0%2C1-1.65%2C4.3%2C5.47%2C5.47%2C0%2C0%2C1-4.14%2C1.7%2C5.53%2C5.53%2C0%2C0%2C1-4.16-1.7A6%2C6%2C0%2C0%2C1%2C101.94%2C12.62Zm2.12%2C0a4.1%2C4.1%2C0%2C0%2C0%2C1.06%2C2.94%2C3.6%2C3.6%2C0%2C0%2C0%2C5.24%2C0%2C4.1%2C4.1%2C0%2C0%2C0%2C1.06-2.94%2C4.07%2C4.07%2C0%2C0%2C0-1.06-2.92%2C3.56%2C3.56%2C0%2C0%2C0-5.24%2C0A4.07%2C4.07%2C0%2C0%2C0%2C104.06%2C12.62Zm21.17%2C5.64h-2V16.69h-.1a3.75%2C3.75%2C0%2C0%2C1-1.48%2C1.38%2C4.23%2C4.23%2C0%2C0%2C1-2.08.55%2C4.18%2C4.18%2C0%2C0%2C1-3.19-1.18%2C4.74%2C4.74%2C0%2C0%2C1-1.11-3.37V7h2.11v6.94a2.49%2C2.49%2C0%2C0%2C0%2C2.79%2C2.76%2C2.63%2C2.63%2C0%2C0%2C0%2C2.11-1%2C3.69%2C3.69%2C0%2C0%2C0%2C.85-2.45V7h2.12Zm7.16.36a5%2C5%2C0%2C0%2C1-3.79-1.74A6.24%2C6.24%2C0%2C0%2C1%2C127%2C12.62a6.2%2C6.2%2C0%2C0%2C1%2C1.56-4.25%2C4.94%2C4.94%2C0%2C0%2C1%2C3.79-1.75%2C4.78%2C4.78%2C0%2C0%2C1%2C2.27.53%2C4%2C4%2C0%2C0%2C1%2C1.58%2C1.4h.09L136.24%2C7V1.79h2.11V18.26h-2V16.69h-.09a4%2C4%2C0%2C0%2C1-1.58%2C1.4A4.78%2C4.78%2C0%2C0%2C1%2C132.39%2C18.62Zm.35-1.93a3.21%2C3.21%2C0%2C0%2C0%2C2.55-1.13%2C4.17%2C4.17%2C0%2C0%2C0%2C1-2.94%2C4.21%2C4.21%2C0%2C0%2C0-1-2.92%2C3.23%2C3.23%2C0%2C0%2C0-2.55-1.15%2C3.29%2C3.29%2C0%2C0%2C0-2.55%2C1.15%2C4.21%2C4.21%2C0%2C0%2C0-1%2C2.92%2C4.14%2C4.14%2C0%2C0%2C0%2C1%2C2.92A3.29%2C3.29%2C0%2C0%2C0%2C132.74%2C16.69Z%22%20style%3D%22fill%3A%235f6368%22/%3E%3Cg%20id%3D%22_75x24px%22%20data-name%3D%2275x24px%22%3E%3Cpath%20d%3D%22M9.49%2C18.62A9.46%2C9.46%2C0%2C0%2C1%2C0%2C9.31%2C9.46%2C9.46%2C0%2C0%2C1%2C9.49%2C0%2C8.91%2C8.91%2C0%2C0%2C1%2C15.9%2C2.57L14.09%2C4.36a6.51%2C6.51%2C0%2C0%2C0-4.6-1.82A6.69%2C6.69%2C0%2C0%2C0%2C2.78%2C9.31a6.69%2C6.69%2C0%2C0%2C0%2C6.71%2C6.77%2C6.25%2C6.25%2C0%2C0%2C0%2C4.72-1.87A5.26%2C5.26%2C0%2C0%2C0%2C15.6%2C11H9.49V8.47h8.6a8.38%2C8.38%2C0%2C0%2C1%2C.13%2C1.59A8.37%2C8.37%2C0%2C0%2C1%2C16%2C16%2C8.57%2C8.57%2C0%2C0%2C1%2C9.49%2C18.62Z%22%20style%3D%22fill%3A%234285f4%22/%3E%3Cpath%20d%3D%22M31.52%2C12.62a5.94%2C5.94%2C0%2C1%2C1-11.87%2C0%2C5.94%2C5.94%2C0%2C1%2C1%2C11.87%2C0Zm-2.6%2C0a3.35%2C3.35%2C0%2C1%2C0-6.67%2C0%2C3.35%2C3.35%2C0%2C1%2C0%2C6.67%2C0Z%22%20style%3D%22fill%3A%23ea4335%22/%3E%3Cpath%20d%3D%22M44.83%2C12.62a5.94%2C5.94%2C0%2C1%2C1-11.87%2C0%2C5.94%2C5.94%2C0%2C1%2C1%2C11.87%2C0Zm-2.6%2C0a3.35%2C3.35%2C0%2C1%2C0-6.68%2C0%2C3.35%2C3.35%2C0%2C1%2C0%2C6.68%2C0Z%22%20style%3D%22fill%3A%23fbbc04%22/%3E%3Cpath%20d%3D%22M57.8%2C7V17.76c0%2C4.42-2.63%2C6.24-5.73%2C6.24a5.75%2C5.75%2C0%2C0%2C1-5.34-3.54l2.31-1a3.32%2C3.32%2C0%2C0%2C0%2C3%2C2.14c2%2C0%2C3.22-1.23%2C3.22-3.52v-.86H55.2A4.16%2C4.16%2C0%2C0%2C1%2C52%2C18.62a6%2C6%2C0%2C0%2C1%2C0-12A4.22%2C4.22%2C0%2C0%2C1%2C55.2%2C8h.09V7Zm-2.33%2C5.66A3.39%2C3.39%2C0%2C0%2C0%2C52.25%2C9a3.48%2C3.48%2C0%2C0%2C0-3.35%2C3.66%2C3.45%2C3.45%2C0%2C0%2C0%2C3.35%2C3.61A3.35%2C3.35%2C0%2C0%2C0%2C55.47%2C12.65Z%22%20style%3D%22fill%3A%234285f4%22/%3E%3Cpath%20d%3D%22M62.43.64V18.26H59.79V.64Z%22%20style%3D%22fill%3A%2334a853%22/%3E%3Cpath%20d%3D%22M72.83%2C14.6%2C74.89%2C16a6%2C6%2C0%2C0%2C1-5%2C2.66%2C5.81%2C5.81%2C0%2C0%2C1-5.89-6%2C5.52%2C5.52%2C0%2C0%2C1%2C10.75-2.18l.27.69-8%2C3.31a3.07%2C3.07%2C0%2C0%2C0%2C2.92%2C1.82A3.44%2C3.44%2C0%2C0%2C0%2C72.83%2C14.6Zm-6.31-2.16%2C5.38-2.22A2.34%2C2.34%2C0%2C0%2C0%2C69.66%2C9%2C3.29%2C3.29%2C0%2C0%2C0%2C66.52%2C12.44Z%22%20style%3D%22fill%3A%23ea4335%22/%3E%3C/g%3E%3C/svg%3E%0A`,
    defaultConfiguration: GOOGLE_CLOUD_DEFAULTS.cpu,
  },
  lambda: {
    name: "lambda",
    label: "Lambda Cloud",
    image: "https://cloud.lambdalabs.com/static/images/lambda-logo.svg",
    defaultConfiguration: {
      cloud: "lambda",
      image: "python",
      instance_type_name: "gpu_1x_a10",
      region_name: "us-west-1",
      excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
    },
  },
  hyperstack: {
    name: "hyperstack",
    label: "Hyperstack GPU Cloud",
    // image is https://console.hyperstack.cloud/hyperstack-wordmark.svg but that URL
    // is slow, so we directly urlencode the svg as follows for speed.
    image: `data:image/svg+xml;utf8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22utf-8%22%3F%3E%0A%3C%21--%20Generator%3A%20Adobe%20Illustrator%2025.4.0%2C%20SVG%20Export%20Plug-In%20.%20SVG%20Version%3A%206.00%20Build%200%29%20%20--%3E%0A%3Csvg%20version%3D%221.1%22%20id%3D%22Layer_1%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20xmlns%3Axlink%3D%22http%3A//www.w3.org/1999/xlink%22%20x%3D%220px%22%20y%3D%220px%22%0A%09%20viewBox%3D%220%200%20174%2031%22%20style%3D%22enable-background%3Anew%200%200%20174%2031%3B%22%20xml%3Aspace%3D%22preserve%22%3E%0A%3Cstyle%20type%3D%22text/css%22%3E%0A%09.st0%7Bfill%3A%231A1A1A%3B%7D%0A%09.st1%7Bfill%3Aurl%28%23SVGID_1_%29%3B%7D%0A%3C/style%3E%0A%3Cg%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M44.3%2C6.6h-6.5V0h-4.4v17.1h4.4v-6.7h6.5v6.7h4.4V0h-4.4V6.6z%22/%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M57.7%2C13.6h-0.4l-2.6-9.4h-4.3l3.8%2C12.7H57l-0.1%2C0.4c-0.1%2C0.3-0.2%2C0.6-0.4%2C0.9c-0.2%2C0.2-0.4%2C0.4-0.6%2C0.5%0A%09%09c-0.3%2C0.1-0.6%2C0.1-0.9%2C0.1h-3v3.6h2.5c1%2C0%2C2-0.1%2C3-0.4c0.7-0.2%2C1.4-0.7%2C1.8-1.3c0.5-0.8%2C0.8-1.6%2C1-2.5l3.4-13.9h-4L57.7%2C13.6z%22/%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M78.2%2C5.6c-0.5-0.6-1.1-1-1.9-1.4c-0.8-0.3-1.6-0.5-2.4-0.5c-1%2C0-1.9%2C0.2-2.7%2C0.7c-0.8%2C0.5-1.5%2C1.2-1.9%2C2%0A%09%09c-0.2%2C0.3-0.3%2C0.6-0.4%2C1V4.2h-3.4v17.6h4.3v-6.2c0.4%2C0.6%2C0.9%2C1%2C1.5%2C1.3c0.8%2C0.4%2C1.7%2C0.6%2C2.7%2C0.6c0.9%2C0%2C1.7-0.2%2C2.5-0.5%0A%09%09c0.7-0.3%2C1.3-0.8%2C1.8-1.4c0.5-0.6%2C0.9-1.3%2C1.1-2.1c0.3-0.9%2C0.4-1.7%2C0.4-2.6v-0.6c0-0.9-0.1-1.8-0.4-2.6C79.1%2C7%2C78.7%2C6.3%2C78.2%2C5.6z%0A%09%09%20M75.2%2C12.4c-0.2%2C0.5-0.6%2C0.9-1%2C1.2c-0.4%2C0.3-1%2C0.4-1.5%2C0.4c-0.5%2C0-1-0.1-1.4-0.3c-0.5-0.2-0.8-0.6-1.1-1c-0.3-0.5-0.5-1-0.4-1.6%0A%09%09v-0.8c0-0.6%2C0.1-1.1%2C0.4-1.6c0.3-0.4%2C0.6-0.8%2C1.1-1c0.4-0.2%2C0.9-0.4%2C1.4-0.4c0.5%2C0%2C1.1%2C0.1%2C1.5%2C0.4c0.4%2C0.3%2C0.8%2C0.7%2C1%2C1.2%0A%09%09c0.3%2C0.5%2C0.4%2C1.1%2C0.4%2C1.7C75.5%2C11.2%2C75.4%2C11.8%2C75.2%2C12.4z%22/%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M91.6%2C4.6c-1.1-0.7-2.3-1-3.5-0.9c-1%2C0-1.9%2C0.2-2.8%2C0.6c-0.8%2C0.3-1.5%2C0.9-2.1%2C1.5c-0.6%2C0.6-1%2C1.4-1.3%2C2.1%0A%09%09c-0.3%2C0.8-0.5%2C1.7-0.5%2C2.5v0.5c0%2C1.7%2C0.6%2C3.4%2C1.8%2C4.6c0.6%2C0.7%2C1.3%2C1.2%2C2.1%2C1.5c0.9%2C0.4%2C1.9%2C0.6%2C2.9%2C0.6c1%2C0%2C2-0.2%2C2.9-0.6%0A%09%09c0.8-0.4%2C1.5-0.9%2C2.1-1.6c0.6-0.7%2C0.9-1.5%2C1.1-2.3h-3.9c-0.2%2C0.4-0.5%2C0.7-0.8%2C0.8c-0.5%2C0.2-1%2C0.3-1.5%2C0.3c-0.6%2C0-1.1-0.1-1.6-0.4%0A%09%09c-0.4-0.3-0.8-0.7-0.9-1.2c-0.1-0.2-0.2-0.5-0.2-0.7h9.2v-1.4c0-1.2-0.3-2.3-0.8-3.3C93.3%2C6.1%2C92.6%2C5.3%2C91.6%2C4.6z%20M85.4%2C9.5%0A%09%09c0-0.3%2C0.1-0.6%2C0.2-0.8c0.2-0.5%2C0.5-0.9%2C1-1.2c0.4-0.3%2C1-0.4%2C1.5-0.4c0.5%2C0%2C1%2C0.1%2C1.4%2C0.4c0.4%2C0.3%2C0.7%2C0.7%2C0.9%2C1.2%0A%09%09c0.1%2C0.3%2C0.2%2C0.5%2C0.2%2C0.8H85.4z%22/%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M101.3%2C5.5c-0.7%2C1-1%2C2.1-1.1%2C3.3V4.2h-3.4v13h4.3v-6.5c0-1%2C0.3-1.7%2C0.8-2.2c0.5-0.5%2C1.3-0.8%2C2.2-0.8h1V4h-0.5%0A%09%09C103.2%2C4%2C102.1%2C4.5%2C101.3%2C5.5z%22/%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M117%2C10.3c-0.9-0.7-2.2-1.2-3.8-1.4l-0.9-0.1c-0.5%2C0-1-0.2-1.4-0.4c-0.1-0.1-0.2-0.2-0.3-0.3%0A%09%09c-0.1-0.1-0.1-0.3-0.1-0.4c0-0.2%2C0-0.3%2C0.1-0.4s0.2-0.2%2C0.3-0.3c0.4-0.2%2C0.8-0.3%2C1.2-0.3c0.5%2C0%2C1.1%2C0.1%2C1.5%2C0.4%0A%09%09c0.3%2C0.2%2C0.6%2C0.6%2C0.6%2C1h3.8c0-0.6-0.1-1.3-0.4-1.8s-0.7-1.1-1.2-1.4c-1.1-0.8-2.5-1.1-4.2-1.1c-1%2C0-1.9%2C0.1-2.8%2C0.5%0A%09%09c-0.8%2C0.3-1.4%2C0.8-1.9%2C1.4c-0.5%2C0.7-0.7%2C1.5-0.7%2C2.4c0%2C0.5%2C0.1%2C1%2C0.3%2C1.5c0.2%2C0.5%2C0.5%2C0.9%2C0.9%2C1.3c0.8%2C0.7%2C2%2C1.2%2C3.7%2C1.4l0.9%2C0.1%0A%09%09c0.8%2C0.1%2C1.4%2C0.2%2C1.7%2C0.4c0.1%2C0.1%2C0.3%2C0.2%2C0.3%2C0.3s0.1%2C0.3%2C0.1%2C0.5c0%2C0.2-0.1%2C0.4-0.2%2C0.5c-0.1%2C0.1-0.3%2C0.3-0.4%2C0.3%0A%09%09c-0.5%2C0.2-0.9%2C0.3-1.4%2C0.2c-0.6%2C0-1.2-0.1-1.8-0.4c-0.2-0.1-0.3-0.3-0.5-0.4c-0.1-0.2-0.2-0.4-0.3-0.6h-3.8c0%2C0.6%2C0.2%2C1.3%2C0.5%2C1.8%0A%09%09c0.3%2C0.6%2C0.7%2C1.1%2C1.3%2C1.4c1.1%2C0.8%2C2.6%2C1.2%2C4.4%2C1.2c1.1%2C0%2C2.1-0.1%2C3.2-0.5c0.8-0.3%2C1.5-0.8%2C2-1.5c0.5-0.7%2C0.7-1.5%2C0.7-2.3%0A%09%09c0-0.6-0.1-1.1-0.3-1.6C117.7%2C11.1%2C117.4%2C10.7%2C117%2C10.3z%22/%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M124.8%2C0.8h-3.9v3.4H119v3.1h1.9v4.6c0%2C1.4%2C0.2%2C2.4%2C0.6%2C3.2c0.4%2C0.8%2C1%2C1.4%2C1.8%2C1.7c1.1%2C0.4%2C2.2%2C0.6%2C3.4%2C0.5%0A%09%09h1.8v-3.6h-1.8c-0.2%2C0-0.5%2C0-0.7-0.1c-0.2-0.1-0.4-0.2-0.6-0.4c-0.2-0.2-0.3-0.4-0.4-0.6c-0.1-0.2-0.1-0.5-0.1-0.7V7.3h3.6V4.2%0A%09%09h-3.5L124.8%2C0.8z%22/%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M139%2C4.5c-1.1-0.4-2.2-0.6-3.4-0.6c-0.5%2C0-1%2C0-1.5%2C0c-0.6%2C0-1.1%2C0-1.6%2C0.1s-1%2C0.1-1.3%2C0.1v3.6%0A%09%09c0.5%2C0%2C1.1-0.1%2C1.8-0.1c0.6%2C0%2C1.3-0.1%2C1.8-0.1c0.6%2C0%2C1%2C0%2C1.3%2C0c0.6%2C0%2C1.1%2C0.1%2C1.4%2C0.4c0.3%2C0.4%2C0.4%2C0.8%2C0.4%2C1.3h-2%0A%09%09c-1.1%2C0-2.1%2C0.1-3.1%2C0.4c-0.8%2C0.2-1.6%2C0.7-2.1%2C1.3c-0.5%2C0.7-0.8%2C1.5-0.8%2C2.4c0%2C0.8%2C0.2%2C1.6%2C0.6%2C2.2c0.4%2C0.6%2C1%2C1.1%2C1.7%2C1.4%0A%09%09c0.8%2C0.3%2C1.6%2C0.5%2C2.4%2C0.5c0.8%2C0%2C1.6-0.1%2C2.3-0.5c0.6-0.3%2C1.1-0.8%2C1.5-1.4c0.2-0.3%2C0.3-0.6%2C0.4-0.9v2.4h3.4V9.3c0-1-0.2-2.1-0.7-3%0A%09%09C140.6%2C5.5%2C139.8%2C4.9%2C139%2C4.5z%20M137.8%2C12.3c0%2C0.5-0.1%2C0.9-0.3%2C1.4c-0.2%2C0.3-0.4%2C0.5-0.7%2C0.7c-0.3%2C0.1-0.7%2C0.2-1%2C0.2%0A%09%09c-0.5%2C0-1-0.1-1.3-0.4c-0.2-0.1-0.3-0.3-0.4-0.5c-0.1-0.2-0.1-0.4-0.1-0.6c0-0.2%2C0-0.4%2C0.1-0.6c0.1-0.2%2C0.2-0.4%2C0.4-0.5%0A%09%09c0.4-0.3%2C0.9-0.5%2C1.3-0.4h2L137.8%2C12.3z%22/%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M152.4%2C13.1c-0.2%2C0.3-0.4%2C0.5-0.7%2C0.7c-0.3%2C0.2-0.7%2C0.2-1.1%2C0.2c-0.5%2C0-1-0.1-1.4-0.4%0A%09%09c-0.4-0.3-0.6-0.7-0.8-1.2c-0.2-0.6-0.2-1.1-0.2-1.7c0-0.6%2C0.1-1.2%2C0.3-1.8c0.1-0.5%2C0.4-0.9%2C0.8-1.2c0.4-0.3%2C0.9-0.4%2C1.4-0.4%0A%09%09c0.3%2C0%2C0.5%2C0%2C0.8%2C0.1c0.3%2C0.1%2C0.5%2C0.2%2C0.7%2C0.4c0.3%2C0.4%2C0.5%2C0.8%2C0.6%2C1.3h4.2c0-1-0.3-2-0.9-2.8c-0.5-0.8-1.3-1.5-2.2-2%0A%09%09c-1-0.5-2.1-0.7-3.1-0.7c-1%2C0-2%2C0.2-2.9%2C0.5c-0.8%2C0.3-1.5%2C0.8-2.1%2C1.5c-0.6%2C0.6-1%2C1.4-1.3%2C2.2c-0.3%2C0.8-0.4%2C1.7-0.4%2C2.6v0.5%0A%09%09c0%2C0.8%2C0.1%2C1.7%2C0.4%2C2.5c0.3%2C0.8%2C0.7%2C1.5%2C1.2%2C2.1c0.6%2C0.6%2C1.3%2C1.2%2C2.1%2C1.5c0.9%2C0.4%2C1.9%2C0.6%2C2.9%2C0.5c1.1%2C0%2C2.2-0.2%2C3.2-0.7%0A%09%09c0.9-0.4%2C1.7-1.1%2C2.2-1.9c0.6-0.9%2C0.9-1.9%2C0.9-2.9h-4.2C152.7%2C12.4%2C152.6%2C12.8%2C152.4%2C13.1z%22/%3E%0A%09%3Cpath%20class%3D%22st0%22%20d%3D%22M168.2%2C9.7l4.1-5.5h-4.5l-4.4%2C6V0h-4.3v17.1h4.3v-6.1h1.1l3.8%2C6.1h4.8L168.2%2C9.7z%22/%3E%0A%09%0A%09%09%3ClinearGradient%20id%3D%22SVGID_1_%22%20gradientUnits%3D%22userSpaceOnUse%22%20x1%3D%22-7.5097%22%20y1%3D%2245.6462%22%20x2%3D%2226.1165%22%20y2%3D%22-0.9586%22%20gradientTransform%3D%22matrix%281%200%200%20-1%200%2032%29%22%3E%0A%09%09%3Cstop%20%20offset%3D%220%22%20style%3D%22stop-color%3A%23DE3C1D%22/%3E%0A%09%09%3Cstop%20%20offset%3D%221%22%20style%3D%22stop-color%3A%236A26D1%22/%3E%0A%09%3C/linearGradient%3E%0A%09%3Cpath%20class%3D%22st1%22%20d%3D%22M5.6%2C15.9V12c0.1%2C0%2C0.2%2C0.1%2C0.3%2C0.1c1%2C0.3%2C4.8%2C1.1%2C5.6%2C1.4c0.7%2C0.2%2C1.4%2C0.5%2C1.8%2C0.9c0.4%2C0.4%2C0.6%2C0.9%2C0.7%2C1.7%0A%09%09c0%2C0%2C0%2C0.2%2C0%2C0.2v4.1h5.6v-4.6c0%2C0%2C0-0.7%2C0-0.8c-0.1-1.2-0.3-2.2-0.8-3c-0.6-1-1.3-1.8-2.2-2.4c-0.8-0.5-1.6-0.9-2.5-1.2h5.5V0%0A%09%09h-5.6v8.4c-0.1%2C0-0.2-0.1-0.3-0.1C12.6%2C8%2C8.8%2C7.2%2C8.1%2C7C7.3%2C6.8%2C6.7%2C6.4%2C6.3%2C6C5.9%2C5.6%2C5.6%2C5%2C5.6%2C4.3c0%2C0%2C0-4.2%2C0-4.3H0v4.6%0A%09%09c0%2C0%2C0%2C0.7%2C0%2C0.8c0.1%2C1.2%2C0.3%2C2.2%2C0.8%2C3c0.6%2C1%2C1.3%2C1.8%2C2.2%2C2.4c0.8%2C0.5%2C1.6%2C0.9%2C2.5%2C1.2H0v4c0%2C0%2C0%2C0.3%2C0%2C0.5%0A%09%09C0.4%2C24.1%2C6.4%2C30.3%2C13.9%2C31v-5.7C9.3%2C24.6%2C5.8%2C20.7%2C5.6%2C15.9z%22/%3E%0A%3C/g%3E%0A%3C/svg%3E%0A`,
    defaultConfiguration: {
      cloud: "hyperstack",
      image: "anaconda-gpu",
      region_name: DEFAULT_HYPERSTACK_REGION,
      flavor_name: DEFAULT_HYPERSTACK_FLAVOR,
      excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
      diskSizeGb: DEFAULT_HYPERSTACK_DISK,
    },
  },
  onprem: {
    name: "onprem",
    label: "Self Hosted",
    icon: "home",
    defaultConfiguration: {
      cloud: "onprem",
      image: "python",
      arch: "x86_64",
      gpu: false,
      excludeFromSync: DEFAULT_EXCLUDE_FROM_SYNC,
    },
  },
};

export const CLOUDS_BY_NAME: {
  [name: string]: CloudInfo;
} = {};
for (const short in CLOUDS) {
  CLOUDS_BY_NAME[CLOUDS[short].name] = CLOUDS[short];
}
