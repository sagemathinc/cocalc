import getLogger from "@cocalc/backend/logger";
import crypto from "node:crypto";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

const logger = getLogger("server:cloud:cloudflare-tunnel");
const TTL = 120;

export type CloudflareTunnel = {
  id: string;
  name: string;
  hostname: string;
  tunnel_secret: string;
  account_id: string;
  record_id?: string;
  token?: string;
};

type TunnelConfig = {
  accountId: string;
  token: string;
  dns: string;
};

type CloudflareResponse<T> = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: T;
};

type ZoneResponse = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{ name?: string; id?: string }>;
};

type DnsRecord = {
  id?: string;
  name?: string;
  content?: string;
  type?: string;
};

type TunnelResponse = {
  id?: string;
  name?: string;
  tunnel_secret?: string;
};

function clean(value: unknown): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
}

function isEnabled(value: unknown): boolean {
  if (value === true) return true;
  if (value == null) return false;
  const lowered = String(value).trim().toLowerCase();
  if (!lowered) return false;
  return !["0", "false", "no", "off"].includes(lowered);
}

async function getConfig(): Promise<TunnelConfig | undefined> {
  const settings = await getServerSettings();
  if (!isEnabled(settings.project_hosts_cloudflare_tunnel_enabled)) {
    return undefined;
  }
  const dns = clean(settings.compute_servers_dns);
  const accountId = clean(settings.project_hosts_cloudflare_tunnel_account_id);
  const token =
    clean(settings.project_hosts_cloudflare_tunnel_api_token) ||
    clean(settings.compute_servers_cloudflare_api_key);
  if (!dns || !accountId || !token) return undefined;
  return { dns, accountId, token };
}

export async function hasCloudflareTunnel(): Promise<boolean> {
  return !!(await getConfig());
}

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
    let details = "";
    try {
      const text = await response.text();
      if (text) {
        try {
          const data = JSON.parse(text) as CloudflareResponse<any>;
          details =
            data?.errors?.map((err) => err.message).filter(Boolean).join(", ") ||
            data?.result?.message ||
            text;
        } catch {
          details = text;
        }
      }
    } catch {
      details = "";
    }
    const suffix = details ? `: ${details}` : "";
    throw new Error(
      `cloudflare api failed: ${method} ${path} -> ${response.status} ${response.statusText}${suffix}`,
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

function isConflictError(err: unknown): boolean {
  const message = String((err as Error)?.message ?? err).toLowerCase();
  return message.includes("409") || message.includes("conflict");
}

let zoneId = "";
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
  zoneIdValue: string,
  name: string,
): Promise<DnsRecord[]> {
  const qs = new URLSearchParams({ type: "CNAME", name });
  return await cloudflareRequest<DnsRecord[]>(
    token,
    "GET",
    `zones/${zoneIdValue}/dns_records?${qs.toString()}`,
  );
}

async function listDnsRecordsByName(
  token: string,
  zoneIdValue: string,
  name: string,
): Promise<DnsRecord[]> {
  const qs = new URLSearchParams({ name });
  return await cloudflareRequest<DnsRecord[]>(
    token,
    "GET",
    `zones/${zoneIdValue}/dns_records?${qs.toString()}`,
  );
}

async function ensureTunnelDns(opts: {
  token: string;
  zoneId: string;
  hostname: string;
  target: string;
  record_id?: string;
}): Promise<string> {
  const updateRecord = async (record_id: string) => {
    const newData = {
      type: "CNAME",
      content: opts.target,
      name: opts.hostname,
      ttl: TTL,
      proxied: true,
    } as const;
    await cloudflareRequest(
      opts.token,
      "PUT",
      `zones/${opts.zoneId}/dns_records/${record_id}`,
      newData,
    );
  };

  const createRecord = async () => {
    const record = {
      type: "CNAME",
      name: opts.hostname,
      content: opts.target,
      ttl: TTL,
      proxied: true,
    } as const;
    const response = await cloudflareRequest<{ id?: string }>(
      opts.token,
      "POST",
      `zones/${opts.zoneId}/dns_records`,
      record,
    );
    const record_id = response?.id;
    if (!record_id) {
      throw new Error("cloudflare did not return record id");
    }
    return record_id;
  };

  let records = await listDnsRecords(opts.token, opts.zoneId, opts.hostname);
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
          opts.token,
          "DELETE",
          `zones/${opts.zoneId}/dns_records/${id}`,
        );
      } catch (err) {
        if (!isNotFoundError(err)) {
          throw err;
        }
      }
    }
  }

  const otherRecords = await listDnsRecordsByName(
    opts.token,
    opts.zoneId,
    opts.hostname,
  );
  for (const record of otherRecords) {
    if (!record.id) continue;
    if (record.id === record_id) continue;
    if (record.type?.toUpperCase() === "CNAME") continue;
    try {
      await cloudflareRequest(
        opts.token,
        "DELETE",
        `zones/${opts.zoneId}/dns_records/${record.id}`,
      );
    } catch (err) {
      if (!isNotFoundError(err)) {
        throw err;
      }
    }
  }

  return record_id;
}

async function fetchTunnel(
  accountId: string,
  token: string,
  tunnelId: string,
): Promise<TunnelResponse | undefined> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(
      `cloudflare tunnel lookup failed: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as CloudflareResponse<TunnelResponse>;
  if (!data?.success) {
    const details =
      data?.errors?.map((err) => err.message).filter(Boolean).join(", ") ||
      "unknown error";
    throw new Error(`cloudflare tunnel lookup failed: ${details}`);
  }
  return data.result;
}

async function createTunnel(
  accountId: string,
  token: string,
  name: string,
  tunnelSecret: string,
): Promise<TunnelResponse> {
  return await cloudflareRequest<TunnelResponse>(
    token,
    "POST",
    `accounts/${accountId}/cfd_tunnel`,
    {
      name,
      config_src: "local",
      tunnel_secret: tunnelSecret,
    },
  );
}

async function listTunnelsByName(
  accountId: string,
  token: string,
  name: string,
): Promise<TunnelResponse[]> {
  const qs = new URLSearchParams({ name });
  return await cloudflareRequest<TunnelResponse[]>(
    token,
    "GET",
    `accounts/${accountId}/cfd_tunnel?${qs.toString()}`,
  );
}

async function deleteTunnel(
  accountId: string,
  token: string,
  tunnelId: string,
): Promise<void> {
  await cloudflareRequest(
    token,
    "DELETE",
    `accounts/${accountId}/cfd_tunnel/${tunnelId}`,
  );
}

async function getTunnelToken(
  accountId: string,
  token: string,
  tunnelId: string,
): Promise<string | undefined> {
  const response = await cloudflareRequest<any>(
    token,
    "POST",
    `accounts/${accountId}/cfd_tunnel/${tunnelId}/token`,
  );
  if (typeof response === "string") return response;
  if (response && typeof response.token === "string") return response.token;
  return undefined;
}

export async function ensureCloudflareTunnelForHost(opts: {
  host_id: string;
  existing?: CloudflareTunnel;
}): Promise<CloudflareTunnel | undefined> {
  const config = await getConfig();
  if (!config) return undefined;
  const hostname = `host-${opts.host_id}.${config.dns}`;
  let tunnelId = opts.existing?.id;
  let tunnelName = opts.existing?.name;
  let tunnelSecret = opts.existing?.tunnel_secret;

  if (tunnelId) {
    try {
      const info = await fetchTunnel(config.accountId, config.token, tunnelId);
      if (!info?.id) {
        tunnelId = undefined;
        tunnelName = undefined;
        tunnelSecret = undefined;
      } else {
        tunnelName = info.name ?? tunnelName;
      }
    } catch (err) {
      if (!isNotFoundError(err)) {
        throw err;
      }
      tunnelId = undefined;
      tunnelName = undefined;
      tunnelSecret = undefined;
    }
  }

  if (!tunnelId || !tunnelSecret) {
    const generatedSecret = crypto.randomBytes(32).toString("base64");
    let created: TunnelResponse | undefined;
    try {
      created = await createTunnel(
        config.accountId,
        config.token,
        tunnelName || `host-${opts.host_id}`,
        generatedSecret,
      );
    } catch (err) {
      if (!isConflictError(err)) {
        throw err;
      }
      const name = tunnelName || `host-${opts.host_id}`;
      const existing = await listTunnelsByName(
        config.accountId,
        config.token,
        name,
      );
      for (const tunnel of existing) {
        if (!tunnel.id) continue;
        try {
          await deleteTunnel(config.accountId, config.token, tunnel.id);
        } catch (deleteErr) {
          if (!isNotFoundError(deleteErr)) {
            throw deleteErr;
          }
        }
      }
      created = await createTunnel(
        config.accountId,
        config.token,
        name,
        generatedSecret,
      );
    }
    if (!created?.id || !created?.tunnel_secret) {
      if (!created?.id) {
        throw new Error("cloudflare tunnel create returned no id");
      }
    }
    tunnelId = created.id;
    tunnelName = created.name ?? tunnelName ?? `host-${opts.host_id}`;
    tunnelSecret = created.tunnel_secret ?? generatedSecret;
    logger.info("cloudflare tunnel created", {
      host_id: opts.host_id,
      tunnel_id: tunnelId,
    });
  }

  const zoneIdValue = await getZoneId(config.token, config.dns);
  const record_id = await ensureTunnelDns({
    token: config.token,
    zoneId: zoneIdValue,
    hostname,
    target: `${tunnelId}.cfargotunnel.com`,
    record_id: opts.existing?.record_id,
  });
  let token: string | undefined;
  try {
    token = await getTunnelToken(config.accountId, config.token, tunnelId);
  } catch (err) {
    logger.warn("cloudflare tunnel token fetch failed", { err });
  }

  return {
    id: tunnelId,
    name: tunnelName ?? `host-${opts.host_id}`,
    hostname,
    tunnel_secret: tunnelSecret,
    account_id: config.accountId,
    record_id,
    token,
  };
}

export async function deleteCloudflareTunnel(opts: {
  host_id?: string;
  tunnel?: CloudflareTunnel;
}): Promise<void> {
  const config = await getConfig();
  if (!config) return;
  const hostname =
    opts.tunnel?.hostname ??
    (opts.host_id ? `host-${opts.host_id}.${config.dns}` : undefined);
  const zoneIdValue = await getZoneId(config.token, config.dns);

  if (opts.tunnel?.record_id) {
    try {
      await cloudflareRequest(
        config.token,
        "DELETE",
        `zones/${zoneIdValue}/dns_records/${opts.tunnel.record_id}`,
      );
    } catch (err) {
      if (!isNotFoundError(err)) {
        logger.warn("cloudflare tunnel dns delete failed", { err });
      }
    }
  } else if (hostname) {
    try {
      const records = await listDnsRecords(config.token, zoneIdValue, hostname);
      for (const record of records) {
        if (!record.id) continue;
        try {
          await cloudflareRequest(
            config.token,
            "DELETE",
            `zones/${zoneIdValue}/dns_records/${record.id}`,
          );
        } catch (err) {
          if (!isNotFoundError(err)) {
            logger.warn("cloudflare tunnel dns delete failed", { err });
          }
        }
      }
    } catch (err) {
      logger.warn("cloudflare tunnel dns lookup failed", { err });
    }
  }

  if (opts.tunnel?.id) {
    try {
      await cloudflareRequest(
        config.token,
        "DELETE",
        `accounts/${config.accountId}/cfd_tunnel/${opts.tunnel.id}`,
      );
    } catch (err) {
      if (!isNotFoundError(err)) {
        logger.warn("cloudflare tunnel delete failed", { err });
      }
    }
  }
}
