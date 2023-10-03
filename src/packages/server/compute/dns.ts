/*
Set or remove DNS record using cloudflare.

Docs: https://www.phind.com/search?cache=cn5flgpcjksj2ov8pcfo8um9
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getLogger from "@cocalc/backend/logger";
import CloudFlare from "cloudflare";

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

export async function hasDNS() {
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
    throw Error("must specify name");
  }
  if (!ipAddress) {
    throw Error("must specify ipAddress");
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
    throw Error("must specify id");
  }
  if (!name) {
    throw Error("must specify name");
  }
  if (!ipAddress) {
    throw Error("must specify ipAddress");
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
  const cf = await getClient();
  await cf.dnsRecords.del(cf.zoneId, id);
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
