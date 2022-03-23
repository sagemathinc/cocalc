/* Get a string[] of the names of strategies that are
   currently configured. Cached a bit so safe to call a lot. */

import getPool from "@cocalc/database/pool";
import { capitalize } from "@cocalc/util/misc";
import { Strategy } from "@cocalc/util/types/sso";

export default async function getStrategies(): Promise<Strategy[]> {
  const pool = getPool("long");
  const { rows } = await pool.query(`
    SELECT strategy,
           COALESCE(info ->> 'icon',     conf ->> 'icon')     as icon,
           COALESCE(info ->> 'display',  conf ->> 'display')  as display,
           COALESCE(info ->> 'public',   conf ->> 'public')   as public
    FROM passport_settings
    WHERE strategy != 'site_conf'`);
  const strategies: Strategy[] = [];
  for (const row of rows) {
    strategies.push({
      name: row.strategy,
      display:
        row.display ??
        (row.strategy == "github" ? "GitHub" : capitalize(row.strategy)),
      icon: row.icon ?? row.strategy,
      backgroundColor: COLORS[row.strategy] ?? "",
      public: (row.public ?? "true") === "true",
    });
  }
  return strategies;
}

const COLORS = {
  github: "#000000",
  facebook: "#428bca",
  google: "#dc4857",
  twitter: "#55acee",
} as const;
