import CloudFlare from "cloudflare";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

// Default TTL is ignored by Cloudflare when proxied.
const TTL = 120;

const logger = getLogger("server:cloud:dns");

interface Client extends CloudFlare {
  zoneId: string;
}

async function getConfig(): Promise<{ token?: string; dns?: string }> {
  const {
    compute_servers_dns: dns,
    compute_servers_cloudflare_api_key: token,
  } = await getServerSettings();
  return { token, dns };
}

export async function hasDns(): Promise<boolean> {
  const { token, dns } = await getConfig();
  return !!token && !!dns;
}

let zoneId = "";
async function getZoneId(cf: Client, dns: string) {
  if (zoneId) return zoneId;
  const response = (await cf.zones.browse()) as { result: { name: string; id: string }[] };
  for (const { name, id } of response.result) {
    if (name === dns) {
      zoneId = id;
      return id;
    }
  }
  throw new Error(`cloudflare zone not found for ${dns}`);
}

async function getClient(): Promise<{ cf: Client; dns: string }> {
  const { token, dns } = await getConfig();
  if (!dns || !token) {
    throw new Error("cloudflare DNS not configured");
  }
  const cf = new CloudFlare({ token }) as Client;
  cf.zoneId = await getZoneId(cf, dns);
  return { cf, dns };
}

export async function ensureHostDns(opts: {
  host_id: string;
  ipAddress: string;
  record_id?: string;
}): Promise<{ name: string; record_id: string }> {
  if (!opts.host_id) throw new Error("host_id required for DNS");
  if (!opts.ipAddress) throw new Error("ipAddress required for DNS");

  const { cf, dns } = await getClient();
  const name = `host-${opts.host_id}.${dns}`;

  if (opts.record_id) {
    const newData = {
      type: "A",
      content: opts.ipAddress,
      name,
      ttl: TTL,
      proxied: true,
    } as const;
    await cf.dnsRecords.edit(cf.zoneId, opts.record_id, newData);
    return { name, record_id: opts.record_id };
  }

  const record = {
    type: "A",
    name,
    content: opts.ipAddress,
    ttl: TTL,
    proxied: true,
  } as const;
  const response = (await cf.dnsRecords.add(cf.zoneId, record)) as {
    result?: { id?: string };
  };
  const record_id = response.result?.id;
  if (!record_id) {
    throw new Error("cloudflare did not return record id");
  }
  logger.debug("dns record created", { name, record_id });
  return { name, record_id };
}

export async function deleteHostDns(opts: { record_id?: string }) {
  if (!opts.record_id) return;
  const { cf } = await getClient();
  try {
    await cf.dnsRecords.del(cf.zoneId, opts.record_id);
  } catch (err: any) {
    if (String(err?.message ?? "").toLowerCase().includes("not found")) {
      return;
    }
    throw err;
  }
}
