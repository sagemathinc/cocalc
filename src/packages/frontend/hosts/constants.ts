import type { CSS } from "@cocalc/frontend/app-framework";
import type { HostProvider } from "./types";

export const WRAP_STYLE: CSS = {
  padding: "10px 0",
  width: "100%",
  height: "100%",
  overflow: "auto",
  boxSizing: "border-box",
};

export const STATUS_COLOR = {
  stopped: "red",
  running: "green",
  active: "green",
  provisioning: "blue",
  starting: "blue",
  restarting: "blue",
  stopping: "orange",
  deprovisioned: "default",
  off: "red",
} as const;

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
  { value: "ssd_io_m3", label: "SSD IO M3" },
  { value: "standard", label: "Standard (HDD)" },
];

const PROVIDER_DISK_TYPES: Partial<Record<HostProvider, string[]>> = {
  hyperstack: ["ssd"],
  nebius: ["ssd_io_m3", "ssd"],
};

export const getDiskTypeOptions = (
  provider?: HostProvider,
) => {
  if (!provider) return DISK_TYPES;
  const allowed = PROVIDER_DISK_TYPES[provider];
  if (!allowed) return DISK_TYPES;
  const optionMap = new Map(DISK_TYPES.map((entry) => [entry.value, entry]));
  const filtered = allowed
    .map((value) => optionMap.get(value))
    .filter((entry): entry is { value: string; label: string } => !!entry);
  if (provider !== "nebius") return filtered;
  return filtered.map((entry) => {
    if (entry.value === "ssd") {
      return { ...entry, label: "Network SSD" };
    }
    if (entry.value === "ssd_io_m3") {
      return { ...entry, label: "Network SSD IO M3" };
    }
    return entry;
  });
};
