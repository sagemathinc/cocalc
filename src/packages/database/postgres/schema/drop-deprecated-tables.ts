/*
Drop ancient deprecated tables in some cases.

This doesn't work via any generic schema, but is some very specific code.
*/

import type { Client } from "@cocalc/database/pool";

export async function dropDeprecatedTables(_db: Client) {
  // No deprecated tables remain that require special-case handling.
}
