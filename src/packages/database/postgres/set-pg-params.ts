/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This is used in postgres-base to set postgres parameters for a single query
// https://www.postgresql.org/docs/10/sql-set.html

import { Client } from "pg";
import { getLogger } from "@cocalc/backend/logger";
import { normalizeValues } from "../pool/pg-utc-normalize";

const L = getLogger("db:set-pg-params").debug;

interface Opts {
  client: Client;
  query: string;
  params: string[];
  pg_params: { [key: string]: string };
  cb: (err?, result?) => void;
}

// Run the actual query after a setup query in a transaction; this is
// used by __do_query in postgres-base
export async function do_query_with_pg_params(opts: Opts): Promise<void> {
  const { client, query, params, pg_params, cb } = opts;
  if (process.env.COCALC_DB === "pglite") {
    // PGlite doesn't support SET LOCAL/transaction-scoped params, and the
    // statement_timeout guard is only relevant for multi-user postgres.
    try {
      const res = await client.query(query, normalizeValues(params));
      cb(undefined, res);
    } catch (err) {
      cb(err);
    }
    return;
  }

  try {
    await client.query("BEGIN");
    for (const [k, v] of Object.entries(pg_params)) {
      // SET LOCAL: only for this transaction!
      // NOTE: interestingly, $1, $2 params do not work … but this isn't user-facing
      const q = `SET LOCAL ${k} TO ${v}`;
      L(`Setting query param: ${k}=${v}`);
      await client.query(q);
    }
    const res = await client.query(query, normalizeValues(params));
    await client.query("COMMIT");
    cb(undefined, res);
  } catch (err) {
    L(`ROLLBACK -- err=${err}`);
    await client.query("ROLLBACK");
    cb(err);
  }
}
