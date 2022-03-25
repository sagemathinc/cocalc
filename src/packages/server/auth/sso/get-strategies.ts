/* Get a string[] of the names of strategies that are
   currently configured. Cached a bit so safe to call a lot. */

import getPool from "@cocalc/database/pool";
import { capitalize } from "@cocalc/util/misc";
import { Strategy } from "@cocalc/util/types/sso";

export default async function getStrategies(): Promise<Strategy[]> {
  const pool = getPool("long");
  // entries in "conf" were used before the "info" col existed. this is only for backwards compatibility.
  const { rows } = await pool.query(`
    SELECT strategy,
           COALESCE(info -> 'icon',              conf -> 'icon')              as icon,
           COALESCE(info -> 'display',           conf -> 'display')           as display,
           COALESCE(info -> 'public',            conf -> 'public')            as public,
           COALESCE(info -> 'exclusive_domains', conf -> 'exclusive_domains') as exclusive_domains,
           COALESCE(info -> 'do_not_hide',      'false'::JSONB)               as do_not_hide

    FROM passport_settings
    WHERE strategy != 'site_conf'
      AND COALESCE(info ->> 'disabled', conf ->> 'disabled', 'false') != 'true'`);

  return rows.map((row) => {
    const display =
      row.display ??
      (row.strategy == "github" ? "GitHub" : capitalize(row.strategy));
    return {
      name: row.strategy,
      display,
      icon: row.icon ?? row.strategy,
      backgroundColor: COLORS[row.strategy] ?? "",
      public: row.public ?? true,
      exclusiveDomains: row.exclusive_domains ?? [],
      doNotHide: row.do_not_hide ?? false,
    };
  });
}

const COLORS = {
  github: "#000000",
  facebook: "#428bca",
  google: "#dc4857",
  twitter: "#55acee",
} as const;
