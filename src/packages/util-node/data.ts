/* Determine the directories where data is stored.

RULES:

- root -- if COCALC_ROOT is set then it; otherwise use [cocalc-source]/src/.
- data -- if the environment variable DATA is set, use that.  Otherwise, use {root}/data
- pgdata -- if env var PGDATA is set, use that; otherwise, it is [data]/postgres: where data data is stored (if running locally)
- pghost - if env var PGHOST is set, use that; otherwise, it is [data]/postgres/socket: what database connects to
- projects -- if env var PROJECTS is set, use that (or PROJECTS_PATH); otherwise, it is [data]/projects: where project home directories are
- secrets -- if env var SECRETS is set, use that; otherwise, it is [data]/secrets:  where to store secrets
- logs -- if env var LOGS is set, use that; otherwise, [data]/logs:  directory in which to store logs
- compute_sqlite -- is [data]/compute.sqlite3: file that contains a sqlite database

*/

import { join, resolve } from "path";

function determineFromPath(): string {
  const cur = __dirname;
  const search = "/src/";
  const i = cur.lastIndexOf(search);
  const root = resolve(cur.slice(0, i + search.length - 1));
  process.env.COCALC_ROOT = root;
  return root;
}

export const root: string = process.env.COCALC_ROOT ?? determineFromPath();
export const data: string = process.env.DATA ?? join(root, "data");
export const pguser: string = process.env.PGUSER ?? "smc";
export const pgdata: string = process.env.PGDATA ?? join(data, "postgres");
export const pghost: string = process.env.PGHOST ?? join(pgdata, "socket");
export const projects: string =
  process.env.PROJECTS ?? process.env.PROJECTS_PATH ?? join(data, "projects");
export const secrets: string = process.env.SECRETS ?? join(data, "secrets");
export const logs: string = process.env.LOGS ?? join(data, "logs");

// TODO: This will hopefully be dreprecated once I simplify the compute server
export const compute_sqlite: string = join(data, "compute.sqlite3");

