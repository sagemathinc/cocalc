import {
  listProviderEntries,
  type ProviderEntry,
  type ProviderId,
  type HostSpec,
  type NebiusInstanceType,
  type NebiusImage,
} from "@cocalc/cloud";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { getNebiusCredentialsFromSettings } from "./nebius-credentials";
import { getData as getGcpPricingData } from "@cocalc/gcloud-pricing-calculator";
import type {
  FlavorRegionData,
  Image as HyperstackImage,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { sendSelfHostCommand } from "@cocalc/server/self-host/commands";

export type ProviderCredsContext = {
  settings: Awaited<ReturnType<typeof getServerSettings>>;
  controlPlanePublicKey: string;
  prefix: string;
};

export type ServerProviderEntry = {
  id: ProviderId;
  entry: ProviderEntry;
  getPrefix: (settings: ProviderCredsContext["settings"]) => string;
  getCreds: (ctx: ProviderCredsContext) => Promise<any> | any;
  getCatalogFetchOptions?: (
    settings: ProviderCredsContext["settings"],
  ) => Promise<any> | any;
  postProcessCatalog?: (catalog: any) => Promise<void>;
  normalizeName?: (prefix: string, base: string) => string;
  getBootstrapDataDiskDevices?: (
    spec: HostSpec,
    storageMode?: string,
  ) => string;
};

const pool = () => getPool("medium");

export async function loadHyperstackCatalog(): Promise<{
  flavors: FlavorRegionData[];
  images: HyperstackImage[];
}> {
  const { rows } = await pool().query(
    `SELECT kind, payload
       FROM cloud_catalog_cache
      WHERE provider=$1 AND kind IN ('flavors', 'images')`,
    ["hyperstack"],
  );
  let flavors: FlavorRegionData[] = [];
  let images: HyperstackImage[] = [];
  for (const row of rows) {
    if (row.kind === "flavors") {
      flavors = Array.isArray(row.payload) ? row.payload : [];
    } else if (row.kind === "images") {
      images = Array.isArray(row.payload) ? row.payload : [];
    }
  }
  return { flavors, images };
}

export async function loadNebiusInstanceTypes(): Promise<NebiusInstanceType[]> {
  const { rows } = await pool().query(
    `SELECT scope, payload
       FROM cloud_catalog_cache
      WHERE provider=$1 AND kind=$2`,
    ["nebius", "instance_types"],
  );
  if (!rows.length) return [];
  const preferred = rows.find((row) => row.scope === "global") ?? rows[0];
  const payload = preferred?.payload;
  return Array.isArray(payload) ? payload : [];
}

export async function loadNebiusImages(): Promise<NebiusImage[]> {
  const { rows } = await pool().query(
    `SELECT scope, payload
       FROM cloud_catalog_cache
      WHERE provider=$1 AND kind=$2`,
    ["nebius", "images"],
  );
  if (!rows.length) return [];
  const preferred = rows.find((row) => row.scope === "global") ?? rows[0];
  const payload = preferred?.payload;
  return Array.isArray(payload) ? payload : [];
}

export function gcpSafeName(prefix: string, base: string): string {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  let safePrefix = normalize(prefix);
  if (!safePrefix || !/^[a-z]/.test(safePrefix)) {
    safePrefix = `cocalc-${safePrefix || "host"}`.replace(/^-+/, "");
  }
  let safeBase = normalize(base);
  const maxLen = 63;
  const room = maxLen - safePrefix.length - 1;
  if (room > 0) {
    if (safeBase.length > room) {
      safeBase = safeBase.slice(0, room);
    }
    return `${safePrefix}-${safeBase}`.replace(/-+$/g, "");
  }
  return safePrefix.slice(0, maxLen);
}

const DEFAULT_PREFIX = "cocalc-host";
const PROVIDER_PREFIX_SETTING: Record<
  ProviderId,
  keyof ProviderCredsContext["settings"] | undefined
> = {
  gcp: "project_hosts_google_prefix",
  hyperstack: "project_hosts_hyperstack_prefix",
  lambda: "project_hosts_lambda_prefix",
  nebius: "project_hosts_nebius_prefix",
  local: undefined,
  "self-host": undefined,
};

export function getProviderPrefix(
  providerId: ProviderId,
  settings: ProviderCredsContext["settings"],
): string {
  const key = PROVIDER_PREFIX_SETTING[providerId];
  return (key && settings[key]) || DEFAULT_PREFIX;
}

function getGcpCatalogFetchOptions(
  settings: ProviderCredsContext["settings"],
) {
  const { google_cloud_service_account_json } = settings;
  if (!google_cloud_service_account_json) {
    return undefined;
  }
  const parsed = JSON.parse(google_cloud_service_account_json);
  if (!parsed.project_id) {
    throw new Error("GCP service account json missing project_id");
  }
  return { projectId: parsed.project_id, credentials: parsed };
}

function getHyperstackCatalogFetchOptions(
  settings: ProviderCredsContext["settings"],
) {
  const { hyperstack_api_key } = settings;
  if (!hyperstack_api_key) {
    return undefined;
  }
  const prefix = getProviderPrefix("hyperstack", settings);
  return { apiKey: hyperstack_api_key, prefix };
}

function getLambdaCatalogFetchOptions(
  settings: ProviderCredsContext["settings"],
) {
  const { lambda_cloud_api_key } = settings;
  if (!lambda_cloud_api_key) {
    return undefined;
  }
  return { apiKey: lambda_cloud_api_key };
}

const NEBIUS_DEFAULT_REGIONS = [
  "eu-north1",
  "eu-west1",
  "me-west1",
  "us-central1",
];

function getNebiusCatalogFetchOptions(
  settings: ProviderCredsContext["settings"],
) {
  const { nebius_parent_id } = settings;
  if (!settings.nebius_credentials_json) {
    return undefined;
  }
  const creds = getNebiusCredentialsFromSettings(settings);
  return {
    ...creds,
    parentId: nebius_parent_id || undefined,
    regions: NEBIUS_DEFAULT_REGIONS,
  };
}

async function postProcessGcpCatalog(catalog: any) {
  if (!Array.isArray(catalog?.zones)) return;
  const pricing = await getGcpPricingData();
  const zonesMeta = pricing?.zones ?? {};
  for (const zone of catalog.zones) {
    const meta = zonesMeta[zone.name ?? ""];
    if (!meta) continue;
    zone.location = meta.location;
    zone.lowC02 = meta.lowC02;
  }
}

type ServerProviderOverrides = Omit<
  ServerProviderEntry,
  "id" | "entry" | "getPrefix"
> & {
  getPrefix?: ServerProviderEntry["getPrefix"];
};

const SERVER_PROVIDER_OVERRIDES: Record<ProviderId, ServerProviderOverrides> = {
  gcp: {
    getCreds: ({ settings, controlPlanePublicKey, prefix }) => ({
      service_account_json: settings.google_cloud_service_account_json,
      ssh_public_key: controlPlanePublicKey,
      prefix,
    }),
    getCatalogFetchOptions: getGcpCatalogFetchOptions,
    postProcessCatalog: postProcessGcpCatalog,
    getBootstrapDataDiskDevices: (spec, storageMode) =>
      storageMode === "ephemeral"
        ? "/dev/disk/by-id/google-local-nvme-ssd-0 /dev/disk/by-id/google-local-ssd-0"
        : `/dev/disk/by-id/google-${spec.name}-data`,
  },
  hyperstack: {
    getCreds: async ({ settings, controlPlanePublicKey, prefix }) => {
      const { hyperstack_api_key } = settings;
      if (!hyperstack_api_key) {
        throw new Error("hyperstack_api_key is not configured");
      }
      const catalog = await loadHyperstackCatalog();
      return {
        apiKey: hyperstack_api_key,
        sshPublicKey: controlPlanePublicKey,
        prefix,
        catalog,
      };
    },
    getCatalogFetchOptions: getHyperstackCatalogFetchOptions,
    getBootstrapDataDiskDevices: () =>
      "/dev/vdb /dev/vdc /dev/xvdb /dev/xvdc /dev/sdb /dev/sdc /dev/nvme1n1 /dev/nvme2n1",
  },
  lambda: {
    getCreds: ({ settings, controlPlanePublicKey, prefix }) => {
      const { lambda_cloud_api_key } = settings;
      if (!lambda_cloud_api_key) {
        throw new Error("lambda_cloud_api_key is not configured");
      }
      return {
        apiKey: lambda_cloud_api_key,
        sshPublicKey: controlPlanePublicKey,
        prefix,
      };
    },
    getCatalogFetchOptions: getLambdaCatalogFetchOptions,
  },
  nebius: {
    getCreds: ({ settings, controlPlanePublicKey, prefix }) => {
      const { nebius_parent_id, nebius_subnet_id } = settings;
      const creds = getNebiusCredentialsFromSettings(settings);
      return {
        ...creds,
        parentId: nebius_parent_id || undefined,
        subnetId: nebius_subnet_id,
        sshPublicKey: controlPlanePublicKey,
        prefix,
      };
    },
    getCatalogFetchOptions: getNebiusCatalogFetchOptions,
  },
  local: {
    getCreds: () => ({}),
  },
  "self-host": {
    getCreds: () => ({
      sendCommand: sendSelfHostCommand,
    }),
  },
};

function buildServerProvider(
  entry: ProviderEntry,
): ServerProviderEntry {
  const overrides = SERVER_PROVIDER_OVERRIDES[entry.id];
  return {
    id: entry.id,
    entry,
    getPrefix:
      overrides.getPrefix ??
      ((settings) => getProviderPrefix(entry.id, settings)),
    normalizeName: overrides.normalizeName ?? gcpSafeName,
    ...overrides,
  };
}

export const SERVER_PROVIDERS: Record<ProviderId, ServerProviderEntry | undefined> =
  Object.fromEntries(
    listProviderEntries().map((entry) => [entry.id, buildServerProvider(entry)]),
  ) as Record<ProviderId, ServerProviderEntry | undefined>;

export function getServerProvider(
  providerId: ProviderId,
): ServerProviderEntry | undefined {
  return SERVER_PROVIDERS[providerId];
}

export function listServerProviders(): ServerProviderEntry[] {
  return Object.values(SERVER_PROVIDERS).filter(
    (entry): entry is ServerProviderEntry => !!entry,
  );
}
