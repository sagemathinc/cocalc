import type { HostCatalog } from "@cocalc/conat/hub/api/hosts";
import type { HostProvider } from "../types";
import {
  getProviderDescriptor,
  type ProviderCatalogSummary,
} from "../providers/registry";

export type CatalogSummary = Partial<
  Record<HostProvider, ProviderCatalogSummary>
>;

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
