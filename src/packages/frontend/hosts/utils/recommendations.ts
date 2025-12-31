import type { HostRecommendation, HostProvider } from "../types";

function normalizeString(value: any): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    if (typeof value.name === "string") return value.name;
    if (typeof value.id === "string") return value.id;
  }
  return undefined;
}

export function extractJsonPayload(reply: string): any | undefined {
  const trimmed = reply.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // fall through
    }
  }
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // fall through
    }
  }
  return undefined;
}

export function normalizeRecommendation(input: any): HostRecommendation | null {
  if (!input || typeof input !== "object") return null;
  const provider = normalizeString(input.provider) as HostProvider | undefined;
  if (
    !provider ||
    (provider !== "gcp" &&
      provider !== "hyperstack" &&
      provider !== "lambda" &&
      provider !== "nebius")
  ) {
    return null;
  }
  return {
    title: normalizeString(input.title ?? input.name ?? input.label),
    provider,
    region: normalizeString(input.region),
    zone: normalizeString(input.zone),
    machine_type: normalizeString(input.machine_type ?? input.instance_type),
    flavor: normalizeString(input.flavor),
    gpu_type: normalizeString(input.gpu_type),
    gpu_count:
      typeof input.gpu_count === "number" ? input.gpu_count : undefined,
    disk_gb: typeof input.disk_gb === "number" ? input.disk_gb : undefined,
    source_image: normalizeString(input.source_image ?? input.image),
    rationale: normalizeString(input.rationale ?? input.reason),
    est_cost_per_hour:
      typeof input.est_cost_per_hour === "number"
        ? input.est_cost_per_hour
        : undefined,
  };
}

export function buildRecommendationUpdate(
  rec: HostRecommendation,
): Record<string, any> {
  if (!rec.provider) return {};
  const next: Record<string, any> = { provider: rec.provider };
  if (rec.provider === "gcp") {
    if (rec.region) next.region = rec.region;
    if (rec.zone) next.zone = rec.zone;
    if (rec.machine_type) next.machine_type = rec.machine_type;
    if (rec.gpu_type) next.gpu_type = rec.gpu_type;
    if (rec.source_image) next.source_image = rec.source_image;
  } else if (rec.provider === "hyperstack") {
    if (rec.region) next.region = rec.region;
    if (rec.flavor) next.size = rec.flavor;
  } else if (rec.provider === "lambda") {
    if (rec.region) next.region = rec.region;
    if (rec.machine_type) next.machine_type = rec.machine_type;
  } else if (rec.provider === "nebius") {
    if (rec.region) next.region = rec.region;
    if (rec.machine_type) next.machine_type = rec.machine_type;
  }
  if (rec.disk_gb) next.disk = rec.disk_gb;
  return next;
}
