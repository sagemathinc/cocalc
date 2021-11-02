import getPool from "@cocalc/database/pool";
import { parseDomain, ParseResultType } from "parse-domain";

export default async function isDomainExclusiveSSO(
  email_address: string
): Promise<string | undefined> {
  if (!email_address) {
    return;
  }

  const raw_domain = email_address.split("@")[1]?.trim().toLowerCase();
  if (!raw_domain) {
    return;
  }

  const exclusiveDomains = await getExclusiveDomains();
  if (exclusiveDomains.length == 0) {
    // For most servers, this is the case.
    return;
  }

  const parsed = parseDomain(raw_domain);
  if (parsed.type != ParseResultType.Listed) {
    // Domain not in the public suffix list
    return;
  }

  const { domain, topLevelDomains } = parsed;
  const canonical = [domain ?? "", ...topLevelDomains].join(".");
  if (exclusiveDomains.includes(canonical)) {
    return canonical;
  }
}

async function getExclusiveDomains(): Promise<string[]> {
  const pool = getPool("minutes"); // exclusive sso is meant for a on prem settings where config RARELY changes.
  const { rows } = await pool.query(
    "SELECT conf#>'{exclusive_domains}' as exclusive_domains FROM passport_settings"
  );
  const v: string[] = [];
  for (const row of rows) {
    const { exclusive_domains } = row;
    if (exclusive_domains) {
      v.push(...exclusive_domains);
    }
  }
  return v;
}
