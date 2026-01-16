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
  provisioning: "blue",
  starting: "blue",
  restarting: "blue",
  stopping: "orange",
  deprovisioning: "orange",
  deprovisioned: "default",
  off: "red",
} as const;

export function isHostTransitioning(status?: string): boolean {
  return (
    status === "starting" ||
    status === "stopping" ||
    status === "restarting" ||
    status === "deprovisioning"
  );
}

export const HOST_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const HOST_ONLINE_WINDOW_MINUTES = Math.floor(HOST_ONLINE_WINDOW_MS / 60000);

const STATUS_TOOLTIP: Record<string, string> = {
  running: "Provider last reported the VM is running.",
  starting: "Provider reports the VM is starting; host is not reachable yet.",
  provisioning: "Provider reports provisioning in progress; host may not be reachable yet.",
  restarting: "Restart requested; waiting for provider to report running.",
  stopping: "Stop requested; waiting for provider to report stopped.",
  deprovisioning: "Deprovision requested; waiting for provider to delete disks.",
  off: "VM is stopped or deleted; data disk retained.",
  stopped: "VM is stopped; data disk retained.",
  deprovisioned: "VM and data disk deleted; data exists only in backups.",
  error: "Provider or bootstrap error; check logs for details.",
};

const ONLINE_TOOLTIP = {
  noHeartbeat: "No heartbeat reported yet.",
  invalidTimestamp: "Heartbeat timestamp is invalid.",
  recent: (minutes: number) =>
    `Heartbeat received within the last ${minutes} minutes.`,
  stale: (minutes: number) =>
    `No heartbeat in the last ${minutes} minutes; host may be running but is not reporting.`,
};

export function isHostOnline(lastSeen?: string): boolean {
  if (!lastSeen) return false;
  const ts = Date.parse(lastSeen);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < HOST_ONLINE_WINDOW_MS;
}

function formatObservedAge(observedAt?: string): string | undefined {
  if (!observedAt) return undefined;
  const ts = Date.parse(observedAt);
  if (Number.isNaN(ts)) return undefined;
  const deltaMs = Date.now() - ts;
  if (deltaMs < 0) return "just now";
  const minutes = Math.round(deltaMs / 60000);
  if (minutes <= 0) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export function getHostStatusTooltip(
  status?: string,
  deleted?: boolean,
  observedAt?: string,
): string {
  if (deleted) return "Host deleted (soft delete).";
  if (!status) return "Status reported by cloud provider.";
  const base = STATUS_TOOLTIP[status] ?? "Status reported by cloud provider.";
  const age = formatObservedAge(observedAt);
  if (!age) return base;
  return `${base} (Last reported ${age}.)`;
}

export function getHostOnlineTooltip(lastSeen?: string): string {
  if (!lastSeen) return ONLINE_TOOLTIP.noHeartbeat;
  const ts = Date.parse(lastSeen);
  if (Number.isNaN(ts)) return ONLINE_TOOLTIP.invalidTimestamp;
  if (isHostOnline(lastSeen)) {
    return ONLINE_TOOLTIP.recent(HOST_ONLINE_WINDOW_MINUTES);
  }
  return ONLINE_TOOLTIP.stale(HOST_ONLINE_WINDOW_MINUTES);
}

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
