import { getProviderEntry, type ProviderEntry, type ProviderId } from "@cocalc/cloud";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { getControlPlaneSshKeypair } from "./ssh-key";
import type {
  FlavorRegionData,
  Image as HyperstackImage,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { getNebiusCredentialsFromSettings } from "./nebius-credentials";

export type ProviderContext = {
  id: ProviderId;
  entry: ProviderEntry;
  creds: any;
  prefix?: string;
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

export async function getProviderContext(
  providerId: ProviderId,
): Promise<ProviderContext> {
  const entry = getProviderEntry(providerId);
  if (!entry) {
    throw new Error(`unsupported cloud provider ${providerId}`);
  }
  const settings = await getServerSettings();
  const { publicKey: controlPlanePublicKey } =
    await getControlPlaneSshKeypair();
  const prefix = await getProviderPrefix(providerId, settings);
  switch (providerId) {
    case "gcp": {
      const { google_cloud_service_account_json } = settings;
      if (!google_cloud_service_account_json) {
        throw new Error("google_cloud_service_account_json is not configured");
      }
      return {
        id: providerId,
        entry,
        creds: { service_account_json: google_cloud_service_account_json },
        prefix,
      };
    }
    case "hyperstack": {
      const { hyperstack_api_key } = settings;
      if (!hyperstack_api_key) {
        throw new Error("hyperstack_api_key is not configured");
      }
      const catalog = await loadHyperstackCatalog();
      return {
        id: providerId,
        entry,
        creds: {
          apiKey: hyperstack_api_key,
          sshPublicKey: controlPlanePublicKey,
          prefix,
          catalog,
        },
        prefix,
      };
    }
    case "lambda": {
      const { lambda_cloud_api_key } = settings;
      if (!lambda_cloud_api_key) {
        throw new Error("lambda_cloud_api_key is not configured");
      }
      return {
        id: providerId,
        entry,
        creds: {
          apiKey: lambda_cloud_api_key,
          sshPublicKey: controlPlanePublicKey,
          prefix,
        },
        prefix,
      };
    }
    case "nebius": {
      const { nebius_parent_id, nebius_subnet_id } = settings;
      const creds = getNebiusCredentialsFromSettings(settings);
      return {
        id: providerId,
        entry,
        creds: {
          ...creds,
          parentId: nebius_parent_id || undefined,
          subnetId: nebius_subnet_id,
          sshPublicKey: controlPlanePublicKey,
          prefix,
        },
        prefix,
      };
    }
    case "local":
      return { id: providerId, entry, creds: {} };
    default:
      throw new Error(`unsupported cloud provider ${providerId}`);
  }
}

export async function getProviderPrefix(
  providerId: ProviderId,
  settings?: Awaited<ReturnType<typeof getServerSettings>>,
): Promise<string> {
  const resolved = settings ?? (await getServerSettings());
  switch (providerId) {
    case "gcp":
      return resolved.project_hosts_google_prefix ?? "cocalc-host";
    case "hyperstack":
      return resolved.project_hosts_hyperstack_prefix ?? "cocalc-host";
    case "lambda":
      return resolved.project_hosts_lambda_prefix ?? "cocalc-host";
    case "nebius":
      return resolved.project_hosts_nebius_prefix ?? "cocalc-host";
    default:
      return "cocalc-host";
  }
}
