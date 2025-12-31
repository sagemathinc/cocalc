export const formatCpuRamLabel = (
  cpu?: number | null,
  ramGb?: number | null,
): string => {
  const cpuLabel = cpu != null ? String(cpu) : "?";
  const ramLabel = ramGb != null ? String(ramGb) : "?";
  return `${cpuLabel} vCPU / ${ramLabel} GB`;
};

export const formatGpuLabel = (
  count?: number | null,
  label?: string | null,
): string => {
  if (!count || count <= 0) return "";
  const suffix = label ? ` ${label}` : " GPU";
  return ` · ${count}x${suffix}`;
};

export const formatRegionsLabel = (count?: number | null): string =>
  count && count > 0 ? ` · ${count} regions` : "";

export const formatRegionLabel = (
  name: string,
  location?: string | null,
  lowC02?: boolean | null,
): string => {
  const lowC02Label = lowC02 ? " (low CO₂)" : "";
  const suffix = location ? ` — ${location}${lowC02Label}` : "";
  return `${name}${suffix}`;
};
