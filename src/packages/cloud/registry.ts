import { GcpProvider } from "./gcp";
import { HyperstackProvider } from "./hyperstack/provider";
import { LambdaProvider } from "./lambda/provider";
import { LocalProvider } from "./local";
import type { CloudProvider, ProviderId } from "./types";
import {
  fetchGcpCatalog,
  fetchHyperstackCatalog,
  fetchLambdaCatalog,
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
