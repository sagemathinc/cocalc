import { GcpProvider } from "./gcp";
import { HyperstackProvider } from "./hyperstack/provider";
import { LambdaProvider } from "./lambda/provider";
import { LocalProvider } from "./local";
import { NebiusProvider } from "./nebius/provider";
import { SelfHostProvider } from "./self-host/provider";
import type { CloudProvider, ProviderId } from "./types";
import {
  fetchGcpCatalog,
  fetchHyperstackCatalog,
  fetchLambdaCatalog,
  fetchNebiusCatalog,
  gcpCatalogEntries,
  hyperstackCatalogEntries,
  lambdaCatalogEntries,
  nebiusCatalogEntries,
  type CatalogEntry,
} from "./catalog";

export type ProviderCapabilities = {
  supportsStop: boolean;
  supportsRestart: boolean;
  supportsHardRestart: boolean;
  supportsDiskType: boolean;
  supportsDiskResize: boolean;
  diskResizeRequiresStop: boolean;
  supportsCustomImage: boolean;
  supportsGpu: boolean;
  supportsZones: boolean;
  persistentStorage: {
    supported: boolean;
    growable: boolean;
  };
  hasRegions: boolean;
  hasZones: boolean;
  hasImages: boolean;
  hasGpus: boolean;
  supportsPersistentStorage: boolean;
  supportsEphemeral: boolean;
  supportsLocalDisk: boolean;
  supportsGpuImages: boolean;
  requiresRegion: boolean;
  requiresZone: boolean;
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

const NEBIUS_TTLS: Record<string, number> = {
  regions: 60 * 60 * 24 * 30,
  instance_types: 60 * 60 * 24 * 7,
  images: 60 * 60 * 24 * 7,
  prices: 60 * 60 * 24 * 30,
};

const gcpProvider = new GcpProvider();
const hyperstackProvider = new HyperstackProvider();
const lambdaProvider = new LambdaProvider();
const localProvider = new LocalProvider();
const nebiusProvider = new NebiusProvider();
const selfHostProvider = new SelfHostProvider();

export const PROVIDERS: Record<ProviderId, ProviderEntry | undefined> = {
  gcp: {
    id: "gcp",
    provider: gcpProvider,
    capabilities: {
      supportsStop: true,
      supportsRestart: true,
      supportsHardRestart: true,
      supportsDiskType: true,
      supportsDiskResize: true,
      diskResizeRequiresStop: false,
      supportsCustomImage: true,
      supportsGpu: true,
      supportsZones: true,
      persistentStorage: { supported: true, growable: true },
      hasRegions: true,
      hasZones: true,
      hasImages: true,
      hasGpus: true,
      supportsPersistentStorage: true,
      supportsEphemeral: true,
      supportsLocalDisk: true,
      supportsGpuImages: true,
      requiresRegion: true,
      requiresZone: true,
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
      supportsStop: false,
      supportsRestart: true,
      supportsHardRestart: true,
      supportsDiskType: false,
      supportsDiskResize: false,
      diskResizeRequiresStop: false,
      supportsCustomImage: true,
      supportsGpu: true,
      supportsZones: false,
      persistentStorage: { supported: true, growable: false },
      hasRegions: true,
      hasZones: false,
      hasImages: true,
      hasGpus: true,
      supportsPersistentStorage: true,
      supportsEphemeral: true,
      supportsLocalDisk: true,
      supportsGpuImages: false,
      requiresRegion: true,
      requiresZone: false,
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
      supportsRestart: true,
      supportsHardRestart: false,
      supportsDiskType: false,
      supportsDiskResize: false,
      diskResizeRequiresStop: false,
      supportsCustomImage: true,
      supportsGpu: true,
      supportsZones: false,
      persistentStorage: { supported: false, growable: false },
      hasRegions: true,
      hasZones: false,
      hasImages: true,
      hasGpus: true,
      supportsPersistentStorage: false,
      supportsEphemeral: true,
      supportsLocalDisk: true,
      supportsGpuImages: false,
      requiresRegion: true,
      requiresZone: false,
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
      supportsRestart: true,
      supportsHardRestart: false,
      supportsDiskType: false,
      supportsDiskResize: false,
      diskResizeRequiresStop: false,
      supportsCustomImage: true,
      supportsGpu: false,
      supportsZones: false,
      persistentStorage: { supported: true, growable: false },
      hasRegions: false,
      hasZones: false,
      hasImages: false,
      hasGpus: false,
      supportsPersistentStorage: true,
      supportsEphemeral: true,
      supportsLocalDisk: true,
      supportsGpuImages: false,
      requiresRegion: false,
      requiresZone: false,
    },
  },
  nebius: {
    id: "nebius",
    provider: nebiusProvider,
    capabilities: {
      supportsStop: true,
      supportsRestart: true,
      supportsHardRestart: false,
      supportsDiskType: true,
      supportsDiskResize: true,
      diskResizeRequiresStop: true,
      supportsCustomImage: true,
      supportsGpu: true,
      supportsZones: false,
      persistentStorage: { supported: true, growable: true },
      hasRegions: true,
      hasZones: false,
      hasImages: true,
      hasGpus: true,
      supportsPersistentStorage: true,
      supportsEphemeral: true,
      supportsLocalDisk: true,
      supportsGpuImages: false,
      requiresRegion: true,
      requiresZone: false,
    },
    fetchCatalog: fetchNebiusCatalog,
    catalog: {
      ttlSeconds: NEBIUS_TTLS,
      toEntries: nebiusCatalogEntries,
    },
  },
  "self-host": {
    id: "self-host",
    provider: selfHostProvider,
    capabilities: {
      supportsStop: true,
      supportsRestart: true,
      supportsHardRestart: false,
      supportsDiskType: false,
      supportsDiskResize: true,
      diskResizeRequiresStop: true,
      supportsCustomImage: false,
      supportsGpu: false,
      supportsZones: false,
      persistentStorage: { supported: true, growable: true },
      hasRegions: true,
      hasZones: false,
      hasImages: false,
      hasGpus: false,
      supportsPersistentStorage: true,
      supportsEphemeral: false,
      supportsLocalDisk: true,
      supportsGpuImages: false,
      requiresRegion: true,
      requiresZone: false,
    },
  },
};

export function getProviderEntry(id: ProviderId): ProviderEntry | undefined {
  return PROVIDERS[id];
}

export function listProviderEntries(): ProviderEntry[] {
  return Object.values(PROVIDERS).filter(
    (entry): entry is ProviderEntry => !!entry,
  );
}
