/*
Set or remove DNS record using cloudflare.

Docs: https://www.phind.com/search?cache=cn5flgpcjksj2ov8pcfo8um9
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getLogger from "@cocalc/backend/logger";
import CloudFlare from "cloudflare";
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

interface Client extends CloudFlare {
  zoneId: string;
}

export async function getClient() {
  const { token, dns } = await getConfig();
  if (!dns || !token) {
    throw Error("compute server DNS not configured");
  }
  const cf = new CloudFlare({ token }) as Client;
  cf.zoneId = await getZoneId(cf, dns);
  return cf;
}

export async function hasDNS(): Promise<boolean> {
  const { token, dns } = await getConfig();
  return !!token && !!dns;
}

let zoneId: string = "";
async function getZoneId(cf: Client, dns: string) {
  if (zoneId) {
    return zoneId;
  }
  // This returns only 100 responses, but the API token *should* only
  // grant access to one zone (for security reasons), in which case
  // this will only return one response.
  const response = await cf.zones.browse();
  for (const { name, id } of response["result"]) {
    if (name == dns) {
      zoneId = id;
      return id;
    }
  }
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
  const cf = await getClient();
  const record = {
    type: "A",
    name,
    content: ipAddress,
    ttl: TTL,
    proxied: true, // Enable Cloudflare proxy
  } as const;
  const response = await cf.dnsRecords.add(cf.zoneId, record);
  return response["result"]?.id;
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
  const cf = await getClient();
  const newData = {
    type: "A",
    content: ipAddress,
    name,
    ttl: TTL,
    proxied: true,
  } as const;
  const response = await cf.dnsRecords.edit(cf.zoneId, id, newData);
  return response;
}

export async function remove({ id }: { id: string }) {
  logger.debug("remove", { id });
  if (!id) {
    throw Error("remove dns - must specify id");
  }
  const cf = await getClient();
  try {
    await cf.dnsRecords.del(cf.zoneId, id);
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
  const cf = await getClient();

  const response = await cf.dnsRecords.browse(cf.zoneId);
  const find = (response) =>
    response.result?.find(
      (record) => record["name"].startsWith(name + ".") && record.type == "A",
    );
  const record = find(response);
  if (record) {
    return record;
  }

  let page = 2;
  // @ts-ignore -- @types/cloudflare is wrong...
  const totalPages = response.result_info.total_pages;
  while (page < totalPages) {
    const response = await cf.dnsRecords.browse(cf.zoneId, { page });
    const record = find(response);
    if (record) {
      return record;
    }
    page += 1;
  }

  return null;
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
