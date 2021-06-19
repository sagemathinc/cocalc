/* Determine the directories where data is stored.

RULES:

- data -- if the environment variable DATA is set, use that.  Otherwise,
  use a heuristic to deduce basically cocalc/src/data from the path to this file.
- pgdata -- if env var PGDATA is set, use that; otherwise, it is [data]/postgres.
- pghost - if env var PGHOST is set, use that; otherwise, it is [data]/postgres/socket.
- projects -- if env var PROJECTS is set, use that; otherwise, it is [data]/projects
- secrets -- if env var SECRETS is set, use that; otherwise, it is [data]/secrets
- compute_sqlite -- is [data]/compute.sqlite3

*/

import { join, resolve } from "path";

function determineFromPath(): string {
  const cur = __dirname;
  const search = "/src/";
  const i = cur.lastIndexOf(search);
  return resolve(cur.slice(0, i + search.length - 1), "data");
}

// NOT exported, since we want to ensure that how the other directories
// are derived from this is all centralized in this file, and that there
// is no other data.
const data: string = process.env.DATA ?? determineFromPath();

export const pgdata: string = process.env.PGDATA ?? join(data, "postgres");
export const pghost: string = process.env.PGHOST ?? join(pgdata, "socket");
export const projects: string = process.env.PROJECTS ?? join(data, "projects");
export const secrets: string = process.env.SECRETS ?? join(data, "secrets");

// TODO: This will hopefully be dreprecated once I simplify the compute server
export const compute_sqlite: string = join(data, "compute.sqlite3");

console.log("data: ", {
  data,
  pgdata,
  pghost,
  projects,
  secrets,
  compute_sqlite,
});
