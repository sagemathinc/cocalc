/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";

import type { DeleteSyncstringOpts, PostgreSQL } from "../types";

interface SyncstringRow {
  archived?: string | null;
}

export async function delete_syncstring(
  db: PostgreSQL,
  opts: DeleteSyncstringOpts,
): Promise<void> {
  if (!opts.string_id || opts.string_id.length !== 40) {
    throw "invalid string_id";
  }

  const where = { "string_id = $::CHAR(40)": opts.string_id };

  const result = await db.async_query<SyncstringRow>({
    query: "SELECT * FROM syncstrings",
    where,
  });

  const syncstring = result.rows?.[0];
  if (!syncstring) {
    return;
  }

  await db.async_query({
    query: "DELETE FROM syncstrings",
    where,
  });

  if (syncstring.archived) {
    await callback2(db.delete_blob.bind(db), { uuid: syncstring.archived });
    return;
  }

  await db.async_query({
    query: "DELETE FROM patches",
    where,
    timeout_s: 300,
  });
}
