import { db } from "@cocalc/database";
import type { PostgreSQL } from "@cocalc/database/postgres";
import { enableDbAdminAlerts } from "@cocalc/server/messages/admin-alert";

// IMPORTANT: For typescript we make the default export have type PostgreSQL.
// In reality the default could be undefined until init gets called.
// We thus assume for convenience that init gets called before this default
// object gets used.
let database: PostgreSQL | undefined = undefined;

export function getDatabase(): PostgreSQL {
  if (database == null) {
    throw new Error("database not initialized yet");
  }
  return database;
}

export default function init(): PostgreSQL {
  if (database != null) {
    throw Error("only call database init once");
  }
  database = db();

  enableDbAdminAlerts();

  return database;
}
