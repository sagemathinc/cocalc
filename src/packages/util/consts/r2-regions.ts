/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export const R2_REGIONS = [
  "wnam",
  "enam",
  "weur",
  "eeur",
  "apac",
  "oc",
] as const;

export type R2Region = (typeof R2_REGIONS)[number];

export const DEFAULT_R2_REGION: R2Region = "wnam";

export const R2_REGION_LABELS: Record<R2Region, string> = {
  wnam: "Western North America",
  enam: "Eastern North America",
  weur: "Western Europe",
  eeur: "Eastern Europe",
  apac: "Asia-Pacific",
  oc: "Oceania",
};

export function parseR2Region(value?: string | null): R2Region | undefined {
  if (!value) return;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;
  if ((R2_REGIONS as readonly string[]).includes(normalized)) {
    return normalized as R2Region;
  }
  return;
}

export function mapCloudRegionToR2Region(
  region?: string | null,
): R2Region {
  const normalized = (region ?? "").trim().toLowerCase();
  if (!normalized) return DEFAULT_R2_REGION;
  const direct = parseR2Region(normalized);
  if (direct) return direct;
  if (normalized.startsWith("africa-") || normalized.includes("africa")) {
    return "weur";
  }
  if (/^europe-central2/.test(normalized) || normalized.includes("europe-east")) {
    return "eeur";
  }
  if (
    normalized.startsWith("europe-") ||
    normalized.startsWith("eu-") ||
    normalized.includes("norway")
  ) {
    return "weur";
  }
  if (normalized.startsWith("northamerica-") || normalized.includes("canada")) {
    return "enam";
  }
  if (normalized.startsWith("southamerica-")) {
    return "enam";
  }
  if (/^us-(west|south)/.test(normalized)) {
    return "wnam";
  }
  if (/^us-(east|central|north)/.test(normalized) || normalized.startsWith("us-")) {
    return "enam";
  }
  if (normalized.startsWith("me-")) {
    return "eeur";
  }
  if (
    normalized.startsWith("ap-") ||
    normalized.startsWith("asia") ||
    normalized.includes("apac")
  ) {
    return "apac";
  }
  if (normalized.startsWith("oc") || normalized.includes("australia")) {
    return "oc";
  }
  return DEFAULT_R2_REGION;
}
