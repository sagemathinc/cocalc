import type { HostRecommendation, HostProvider } from "../types";
import { isKnownProvider } from "../providers/registry";

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
  if (!provider || provider === "none" || !isKnownProvider(provider)) {
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
    rationale: normalizeString(input.rationale ?? input.reason),
    est_cost_per_hour:
      typeof input.est_cost_per_hour === "number"
        ? input.est_cost_per_hour
        : undefined,
  };
}
