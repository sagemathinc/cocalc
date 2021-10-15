/* Get a string[] of the names of strategies that are
   currently configured. Cached a bit so safe to call a lot. */

import getPool from "@cocalc/backend/database";
import { capitalize } from "@cocalc/util/misc";

// Just enough for display to the user:
interface Strategy {
  name: string;
  display: string; // name to display for SSO
  icon: string; // name of or URL to icon to display for SSO
  backgroundColor: string; // background color for icon, if not a link
}

export default async function getStrategies(): Promise<Strategy[]> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT strategy, conf#>>'{icon}' as icon, conf#>>'{display}' as display FROM passport_settings"
  );
  const strategies: Strategy[] = [];
  for (const row of rows) {
    strategies.push({
      name: row.strategy,
      display:
        row.display ??
        (row.strategy == "github" ? "GitHub" : capitalize(row.strategy)),
      icon: row.icon ?? row.strategy,
      backgroundColor: COLORS[row.strategy] ?? "",
    });
  }
  return strategies;
}

const COLORS = {
  github: "#000000",
  facebook: "#428bca",
  google: "#dc4857",
  twitter: "#55acee",
};
