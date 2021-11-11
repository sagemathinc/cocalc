import { pghost as host, pguser as user, pgdatabase as database } from "@cocalc/backend/data";
import dbPassword from "./password";
export * from "./util";
import getCachedPool, { Length } from "./cached";

import { Pool } from "pg";
let pool: Pool | undefined = undefined;

export default function getPool(cacheLength?: Length): Pool {
  if (cacheLength != null) {
    return getCachedPool(cacheLength);
  }
  if (pool == null) {
    pool = new Pool({ password: dbPassword(), user, host, database });
  }
  return pool;
}
