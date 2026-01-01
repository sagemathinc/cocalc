import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import type { HostProvider } from "../types";
import {
  getProviderDescriptor,
  type ProviderCatalogSummary,
} from "../providers/registry";

export type CatalogSummary = Partial<
  Record<HostProvider, ProviderCatalogSummary>
>;

const REGION_GROUP_ORDER = [
  "any",
  "us-west",
  "us-east",
  "us-central",
  "eu-west",
  "eu-central",
  "asia",
  "australia",
  "southamerica",
];

const regionGroupFromName = (name: string): string => {
  if (name.startsWith("us-west")) return "us-west";
  if (name.startsWith("us-east")) return "us-east";
  if (name.startsWith("us-central")) return "us-central";
  if (name.startsWith("europe")) return "eu-west";
  if (name.startsWith("asia")) return "asia";
  if (name.startsWith("australia")) return "australia";
  if (name.startsWith("southamerica")) return "southamerica";
  return "any";
};

export const buildRegionGroupOptions = (
  summary?: CatalogSummary,
): Array<{ value: string; label: string }> => {
  const groups = new Set<string>();
  if (summary) {
    for (const providerSummary of Object.values(summary)) {
      if (!providerSummary || typeof providerSummary !== "object") continue;
      const regionGroups = (providerSummary as Record<string, any>).region_groups;
      if (regionGroups && typeof regionGroups === "object") {
        Object.keys(regionGroups).forEach((group) => groups.add(group));
        continue;
      }
      const regions = (providerSummary as Record<string, any>).regions;
      if (Array.isArray(regions)) {
        regions
          .map((entry) => entry?.name)
          .filter((name): name is string => typeof name === "string")
          .forEach((name) => groups.add(regionGroupFromName(name)));
      }
    }
  }
  const sorted = Array.from(groups).filter((g) => g !== "any");
  sorted.sort((a, b) => {
    const aIdx = REGION_GROUP_ORDER.indexOf(a);
    const bIdx = REGION_GROUP_ORDER.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });
  return [
    { value: "any", label: "Any region" },
    ...sorted.map((group) => ({ value: group, label: group })),
  ];
};

export const buildCatalogSummary = ({
  catalog,
  enabledProviders,
}: {
  catalog?: HostCatalog;
  enabledProviders: HostProvider[];
}): CatalogSummary | undefined => {
  if (!catalog) return undefined;
  const providers =
    enabledProviders.length > 0
      ? enabledProviders
      : (Object.keys(catalog.provider_capabilities ?? {}) as HostProvider[]);
  const summary: CatalogSummary = {};
  for (const provider of providers) {
    const descriptor = getProviderDescriptor(provider);
    if (!descriptor?.summarizeCatalog) continue;
    const result = descriptor.summarizeCatalog(catalog);
    if (result) summary[provider] = result;
  }
  return Object.keys(summary).length ? summary : undefined;
};
