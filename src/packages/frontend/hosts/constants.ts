import type { CSS } from "@cocalc/frontend/app-framework";

export const WRAP_STYLE: CSS = {
  padding: "24px",
  width: "100%",
  height: "100%",
  overflow: "auto",
  boxSizing: "border-box",
};

export const STATUS_COLOR = {
  stopped: "red",
  running: "green",
  provisioning: "blue",
  starting: "blue",
  stopping: "orange",
  deprovisioned: "default",
  off: "red",
} as const;

export const REGIONS = [
  { value: "us-west", label: "US West" },
  { value: "us-east", label: "US East" },
  { value: "eu-west", label: "EU West" },
];

export const LAMBDA_REGIONS = [
  "us-west-1",
  "us-west-2",
  "us-west-3",
  "us-east-1",
  "us-east-2",
  "us-east-3",
  "us-south-1",
  "us-south-2",
  "us-south-3",
  "us-midwest-1",
  "us-midwest-2",
  "europe-central-1",
  "europe-central-2",
  "europe-central-3",
  "europe-west-1",
  "europe-west-2",
  "europe-west-3",
  "europe-north-1",
  "europe-south-1",
  "asia-south-1",
  "asia-south-2",
  "asia-south-3",
  "asia-northeast-1",
  "asia-northeast-2",
  "asia-northeast-3",
  "asia-east-1",
  "asia-east-2",
  "asia-east-3",
  "asia-southeast-1",
  "asia-southeast-2",
  "me-west-1",
].map((name) => ({ value: name, label: name }));

export const SIZES = [
  { value: "small", label: "Small (2 vCPU / 8 GB)" },
  { value: "medium", label: "Medium (4 vCPU / 16 GB)" },
  { value: "large", label: "Large (8 vCPU / 32 GB)" },
  { value: "gpu", label: "GPU (4 vCPU / 24 GB + GPU)" },
];

export const GPU_TYPES = [
  { value: "none", label: "No GPU" },
  { value: "l4", label: "NVIDIA L4" },
  { value: "a10g", label: "NVIDIA A10G" },
];

export const DISK_TYPES = [
  { value: "balanced", label: "Balanced SSD" },
  { value: "ssd", label: "SSD" },
  { value: "standard", label: "Standard (HDD)" },
];
