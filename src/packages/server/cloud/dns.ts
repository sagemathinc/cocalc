import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

// Default TTL is ignored by Cloudflare when proxied.
const TTL = 120;

const logger = getLogger("server:cloud:dns");

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
type ZoneResponse = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{ name?: string; id?: string }>;
};

type CloudflareResponse<T> = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: T;
};

type DnsRecord = {
  id?: string;
  name?: string;
  content?: string;
  type?: string;
};

async function cloudflareRequest<T>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, any>,
): Promise<T> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!response.ok) {
    throw new Error(
      `cloudflare api failed: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as CloudflareResponse<T>;
  if (!data?.success) {
    const details =
      data?.errors?.map((err) => err.message).filter(Boolean).join(", ") ||
      "unknown error";
    throw new Error(`cloudflare api failed: ${details}`);
  }
  if (data.result === undefined) {
    throw new Error("cloudflare api returned no result");
  }
  return data.result;
}

function isNotFoundError(err: unknown): boolean {
  const message = String((err as Error)?.message ?? err).toLowerCase();
  return message.includes("not found") || message.includes("404");
}

async function getZoneId(token: string, dns: string) {
  if (zoneId) return zoneId;
  const url = new URL("https://api.cloudflare.com/client/v4/zones");
  url.searchParams.set("name", dns);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `cloudflare zones lookup failed: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as ZoneResponse;
  if (!data?.success) {
    const details =
      data?.errors?.map((err) => err.message).filter(Boolean).join(", ") ||
      "unknown error";
    throw new Error(`cloudflare zones lookup failed: ${details}`);
  }
  const match = data.result?.find((zone) => zone.name === dns);
  if (match?.id) {
    zoneId = match.id;
    return match.id;
  }
  throw new Error(`cloudflare zone not found for ${dns}`);
}

async function listDnsRecords(
  token: string,
  zoneId: string,
  name: string,
): Promise<DnsRecord[]> {
  const qs = new URLSearchParams({ type: "A", name });
  return await cloudflareRequest<DnsRecord[]>(
    token,
    "GET",
    `zones/${zoneId}/dns_records?${qs.toString()}`,
  );
}

async function getClient(): Promise<{ token: string; dns: string; zoneId: string }> {
  const { token, dns } = await getConfig();
  if (!dns || !token) {
    throw new Error("cloudflare DNS not configured");
  }
  const zoneId = await getZoneId(token, dns);
  return { token, dns, zoneId };
}

export async function ensureHostDns(opts: {
  host_id: string;
  ipAddress: string;
  record_id?: string;
}): Promise<{ name: string; record_id: string }> {
  if (!opts.host_id) throw new Error("host_id required for DNS");
  if (!opts.ipAddress) throw new Error("ipAddress required for DNS");

  const { token, dns, zoneId } = await getClient();
  const name = `host-${opts.host_id}.${dns}`;

  const updateRecord = async (record_id: string) => {
    const newData = {
      type: "A",
      content: opts.ipAddress,
      name,
      ttl: TTL,
      proxied: true,
    } as const;
    await cloudflareRequest(
      token,
      "PUT",
      `zones/${zoneId}/dns_records/${record_id}`,
      newData,
    );
  };

  const createRecord = async () => {
    const record = {
      type: "A",
      name,
      content: opts.ipAddress,
      ttl: TTL,
      proxied: true,
    } as const;
    const response = await cloudflareRequest<{ id?: string }>(
      token,
      "POST",
      `zones/${zoneId}/dns_records`,
      record,
    );
    const record_id = response?.id;
    if (!record_id) {
      throw new Error("cloudflare did not return record id");
    }
    logger.debug("dns record created", { name, record_id });
    return record_id;
  };

  let records = await listDnsRecords(token, zoneId, name);
  let recordIds = records
    .map((record) => record.id)
    .filter((id): id is string => !!id);
  let record_id = opts.record_id;

  if (record_id) {
    try {
      await updateRecord(record_id);
    } catch (err) {
      if (isNotFoundError(err)) {
        record_id = undefined;
      } else {
        throw err;
      }
    }
  }

  if (!record_id) {
    if (!recordIds.length) {
      record_id = await createRecord();
      records = [];
      recordIds = [];
    } else {
      record_id = recordIds[0];
      await updateRecord(record_id);
    }
  }

  if (recordIds.length > 1) {
    const extras = recordIds.filter((id) => id !== record_id);
    for (const id of extras) {
      try {
        await cloudflareRequest(
          token,
          "DELETE",
          `zones/${zoneId}/dns_records/${id}`,
        );
      } catch (err) {
        if (!isNotFoundError(err)) {
          throw err;
        }
      }
    }
  }

  return { name, record_id };
}

export async function deleteHostDns(opts: { record_id?: string }) {
  if (!opts.record_id) return;
  const { token, zoneId } = await getClient();
  try {
    await cloudflareRequest(
      token,
      "DELETE",
      `zones/${zoneId}/dns_records/${opts.record_id}`,
    );
  } catch (err: any) {
    if (isNotFoundError(err)) {
      return;
    }
    throw err;
  }
}
