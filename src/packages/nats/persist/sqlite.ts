import type BetterSqlite3 from "better-sqlite3";
type Database = BetterSqlite3.Database;
export { type Database };

let betterSqlite3: any = null;

export function setDatabase(s) {
  betterSqlite3 = s;
}

export function createDatabase(...args): Database {
  if (betterSqlite3 == null) {
    throw Error(
      "nats/persist must be initialized with the better-sqlite3 module -- import from backend/nats/persist instead",
    );
  }
  return new betterSqlite3(...args);
}
