/*
Set or remove DNS record using cloudflare.

Docs: https://www.phind.com/search?cache=cn5flgpcjksj2ov8pcfo8um9
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:dns");

async function getApiConfig() {
  const { cloudflare_api_key, dns } = await getServerSettings();
  return { cloudflare_api_key, dns };
}

export async function hasDNS() {
  const { cloudflare_api_key, dns } = await getApiConfig();
  return !!cloudflare_api_key && !!dns;
}

//async function getZoneId(cloudflare_api_key, dns) {}

export async function set({
  ip,
  subdomain,
}: {
  ip: string;
  subdomain: string;
}) {
  logger.debug("set", { ip, subdomain });
}

export async function remove({
  ip,
  subdomain,
}: {
  ip: string;
  subdomain: string;
}) {
  logger.debug("remove", { ip, subdomain });
}
