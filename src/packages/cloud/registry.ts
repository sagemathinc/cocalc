import { GcpProvider } from "./gcp";
import { HyperstackProvider } from "./hyperstack/provider";
import { LambdaProvider } from "./lambda/provider";
import { LocalProvider } from "./local";
import type { CloudProvider, ProviderId } from "./types";
import {
  fetchGcpCatalog,
  fetchHyperstackCatalog,
  fetchLambdaCatalog,
  gcpCatalogEntries,
  hyperstackCatalogEntries,
  lambdaCatalogEntries,
  type CatalogEntry,
} from "./catalog";

export type ProviderCapabilities = {
  supportsStop: boolean;
  supportsDiskType: boolean;
  supportsDiskResize: boolean;
  supportsCustomImage: boolean;
  supportsGpu: boolean;
  supportsZones: boolean;
};

export type ProviderEntry = {
  id: ProviderId;
  provider: CloudProvider;
  capabilities: ProviderCapabilities;
  fetchCatalog?: (opts: any) => Promise<any>;
  catalog?: CatalogSpec;
};

export type CatalogSpec = {
  ttlSeconds: Record<string, number>;
  toEntries: (catalog: any) => CatalogEntry[];
};

const GCP_TTLS: Record<string, number> = {
  regions: 60 * 60 * 24 * 30,
  zones: 60 * 60 * 24 * 30,
  machine_types: 60 * 60 * 24 * 7,
  gpu_types: 60 * 60 * 24 * 7,
  images: 60 * 60 * 24 * 7,
};

const HYPERSTACK_TTLS: Record<string, number> = {
  regions: 60 * 60 * 24 * 7,
  flavors: 60 * 60 * 24 * 7,
  images: 60 * 60 * 24 * 7,
  stocks: 60 * 60 * 24 * 7,
};

const LAMBDA_TTLS: Record<string, number> = {
  regions: 60 * 60 * 24 * 7,
  instance_types: 60 * 60 * 24,
  images: 60 * 60 * 24 * 7,
};

const gcpProvider = new GcpProvider();
const hyperstackProvider = new HyperstackProvider();
const lambdaProvider = new LambdaProvider();
const localProvider = new LocalProvider();

export const PROVIDERS: Record<ProviderId, ProviderEntry | undefined> = {
  gcp: {
    id: "gcp",
    provider: gcpProvider,
    capabilities: {
      supportsStop: true,
      supportsDiskType: true,
      supportsDiskResize: true,
      supportsCustomImage: true,
      supportsGpu: true,
      supportsZones: true,
    },
    fetchCatalog: fetchGcpCatalog,
    catalog: {
      ttlSeconds: GCP_TTLS,
      toEntries: gcpCatalogEntries,
    },
  },
  hyperstack: {
    id: "hyperstack",
    provider: hyperstackProvider,
    capabilities: {
      supportsStop: true,
      supportsDiskType: false,
      supportsDiskResize: false,
      supportsCustomImage: true,
      supportsGpu: true,
      supportsZones: false,
    },
    fetchCatalog: fetchHyperstackCatalog,
    catalog: {
      ttlSeconds: HYPERSTACK_TTLS,
      toEntries: hyperstackCatalogEntries,
    },
  },
  lambda: {
    id: "lambda",
    provider: lambdaProvider,
    capabilities: {
      supportsStop: false,
      supportsDiskType: false,
      supportsDiskResize: false,
      supportsCustomImage: true,
      supportsGpu: true,
      supportsZones: false,
    },
    fetchCatalog: fetchLambdaCatalog,
    catalog: {
      ttlSeconds: LAMBDA_TTLS,
      toEntries: lambdaCatalogEntries,
    },
  },
  local: {
    id: "local",
    provider: localProvider,
    capabilities: {
      supportsStop: true,
      supportsDiskType: false,
      supportsDiskResize: false,
      supportsCustomImage: true,
      supportsGpu: false,
      supportsZones: false,
    },
  },
  nebius: undefined,
};

export function getProviderEntry(id: ProviderId): ProviderEntry | undefined {
  return PROVIDERS[id];
}

export function listProviderEntries(): ProviderEntry[] {
  return Object.values(PROVIDERS).filter(
    (entry): entry is ProviderEntry => !!entry,
  );
}
