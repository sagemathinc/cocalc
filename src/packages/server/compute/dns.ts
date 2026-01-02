/*
Set or remove DNS record using cloudflare.

Docs: https://www.phind.com/search?cache=cn5flgpcjksj2ov8pcfo8um9
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { setData } from "@cocalc/server/compute/util";
import { checkValidDomain } from "@cocalc/util/compute/dns";

// TTL seems ignored by the api and in the UI it shows as "Auto" because
// we're proxying everything and TTL isn't relevant.
const TTL = 120;

const logger = getLogger("server:compute:dns");

async function getConfig(): Promise<{ token?: string; dns?: string }> {
  const {
    compute_servers_dns: dns,
    compute_servers_cloudflare_api_key: token,
  } = await getServerSettings();
  return { token, dns };
}

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

export async function getClient() {
  const { token, dns } = await getConfig();
  if (!dns || !token) {
    throw Error("compute server DNS not configured");
  }
  const zoneId = await getZoneId(token, dns);
  return { token, dns, zoneId };
}

export async function hasDNS(): Promise<boolean> {
  const { token, dns } = await getConfig();
  return !!token && !!dns;
}

let zoneId: string = "";
async function getZoneId(token: string, dns: string) {
  if (zoneId) {
    return zoneId;
  }
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
  throw Error(`cloudflare zone not found for ${dns}`);
}

// Returns the id of the DNS record, which you can use later
// to delete or edit it.
export async function add({
  name,
  ipAddress,
}: {
  ipAddress: string;
  name: string;
}): Promise<string> {
  logger.debug("addDnsRecord", { ipAddress, name });
  if (!name) {
    throw Error("add dns - must specify name");
  }
  if (!ipAddress) {
    throw Error("add dns - must specify ipAddress");
  }
  const { token, dns, zoneId } = await getClient();
  const recordName = name.includes(".") ? name : `${name}.${dns}`;
  const record = {
    type: "A",
    name: recordName,
    content: ipAddress,
    ttl: TTL,
    proxied: true, // Enable Cloudflare proxy
  } as const;
  const response = await cloudflareRequest<{ id?: string }>(
    token,
    "POST",
    `zones/${zoneId}/dns_records`,
    record,
  );
  return response?.id ?? "";
}

export async function edit({
  id,
  name,
  ipAddress,
}: {
  ipAddress: string;
  name: string;
  id: string;
}) {
  logger.debug("editDnsRecord", { id, ipAddress });
  if (!id) {
    throw Error("edit dns - must specify id");
  }
  if (!name) {
    throw Error("edit dns - must specify name");
  }
  if (!ipAddress) {
    throw Error("edit dns - must specify ipAddress");
  }
  const { token, dns, zoneId } = await getClient();
  const recordName = name.includes(".") ? name : `${name}.${dns}`;
  const newData = {
    type: "A",
    content: ipAddress,
    name: recordName,
    ttl: TTL,
    proxied: true,
  } as const;
  return await cloudflareRequest(
    token,
    "PUT",
    `zones/${zoneId}/dns_records/${id}`,
    newData,
  );
}

export async function remove({ id }: { id: string }) {
  logger.debug("remove", { id });
  if (!id) {
    throw Error("remove dns - must specify id");
  }
  const { token, zoneId } = await getClient();
  try {
    await cloudflareRequest(
      token,
      "DELETE",
      `zones/${zoneId}/dns_records/${id}`,
    );
  } catch (err) {
    if (err.message.toLowerCase().includes("not found")) {
      // deleting something that is already deleted
      return;
    }
    throw err;
  }
}

/*
get -- Returns the DNS recording with
given name, or null if there is no such subdomain.
**AVOID USING THIS**  Code should normally
never have to use this, and should instead store the id
that gets returned.  However, in the edge case where, e.g.,
the dns record gets set but for some reason the id doesn't
get stored in the database (e.g., maybe there is an outage)
then this allows for a graceful way to recover.
It has to get all the DNS records via a pager, and do
a linear search.

NOTE: this is *slow*.
*/
export async function get({ name }: { name: string }) {
  logger.debug("getDnsId", { name }, " -- WARNING: avoid calling this!");
  if (!name) {
    throw Error("must specify name");
  }
  const { token, dns, zoneId } = await getClient();
  const recordName = name.includes(".") ? name : `${name}.${dns}`;
  const url = new URL(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
  );
  url.searchParams.set("type", "A");
  url.searchParams.set("name", recordName);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `cloudflare dns lookup failed: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as CloudflareResponse<
    Array<{ id?: string }>
  >;
  if (!data?.success) {
    const details =
      data?.errors?.map((err) => err.message).filter(Boolean).join(", ") ||
      "unknown error";
    throw new Error(`cloudflare dns lookup failed: ${details}`);
  }
  return data.result?.[0] ?? null;
}

// Throw error if the given dns name is currently set for any compute server's configuration.
// TODO: we may someday need an index on the configuration jsonb?
export async function isDnsAvailable(dns: string): Promise<boolean> {
  try {
    checkValidDomain(dns);
  } catch (_) {
    // invalid dns is never available
    return false;
  }
  // no caching, obviously.
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM compute_servers WHERE configuration->>'dns' = $1 AND (deleted = false OR deleted is NULL)",
    [dns],
  );
  return rows[0].count == 0;
}

export async function makeDnsChange({
  id,
  name,
  previousName,
  cloud,
}: {
  id: number;
  name: string | undefined;
  previousName?: string | undefined;
  cloud;
}) {
  logger.debug("makeDnsChange", { id, name, previousName });
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT data->>'cloudflareId' as cloudflare_id, data->>'externalIp' as external_ip FROM compute_servers WHERE id=$1",
    [id],
  );
  if (rows.length == 0) {
    throw Error(`no compute server with id ${id}`);
  }
  const ipAddress = rows[0].external_ip;
  let cloudflareId = rows[0].cloudflare_id;
  if (!cloudflareId && previousName) {
    cloudflareId = await get({ name: previousName });
  }
  logger.debug("makeDnsChange", { ipAddress, cloudflareId });

  if (!name) {
    // removing DNS
    if (!cloudflareId) {
      // no dns configured right now, so nothing to do.
      return;
    }
    // remove the record
    logger.debug("makeDnsChange", "remove the record");
    await remove({ id: cloudflareId });
    await setData({ id, cloud, data: { cloudflareId: "" } });
    return;
  } else {
    // setting/adding/changing DNS -- definitely need to have an ip address
    if (!ipAddress) {
      const message = `No ip address allocated to compute server, so can't update DNS. Click 'Running' to try again.`;
      logger.debug("makeDnsChange", message);
      throw Error(message);
    }
    if (cloudflareId) {
      try {
        logger.debug("makeDnsChange", "edit existing dns record");
        await edit({ id: cloudflareId, name, ipAddress });
        return;
      } catch (err) {
        logger.debug(
          "makeDnsChange -- failed to change using existing record.  Will try to create record.",
          err,
        );
      }
    }
    try {
      logger.debug("makeDnsChange", "create dns record", { name, ipAddress });
      cloudflareId = await add({ name, ipAddress });
    } catch (err) {
      logger.debug("makeDnsChange", "creating failed with error", err);
      // try again
      cloudflareId = await get({ name });
      logger.debug(
        "makeDnsChange",
        "browsed and found ",
        { cloudflareId },
        ", so try again",
      );
      await edit({ id: cloudflareId, name, ipAddress });
    }
    logger.debug(
      "makeDnsChange",
      "save cloudflare id to database so we can edit it later",
    );
    await setData({ id, cloud, data: { cloudflareId } });
  }
}
