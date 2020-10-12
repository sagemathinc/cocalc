/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is used in postgres-base for setting postges parameters of a single query

import { Client } from "pg";

interface Opts {
  client: Client;
  query: string;
  params: string[];
  pg_params: { [key: string]: string };
  cb: (err?, result?) => void;
}

// run the actualy query after a setup quey in a transaction
// used by __do_query in postgres-base
export async function do_query_with_pg_params(opts: Opts): Promise<void> {
  const { client, query, params, pg_params, cb } = opts;

  try {
    await client.query("BEGIN");
    // const res = await client.query(queryText, ["brianc"]);
    for (const [k, v] of Object.entries(pg_params)) {
      // LOCAL: only for this transaction!
      console.log("SET LOCAL $1 TO $2", k, v);
      await client.query("SET $1 TO $2", [k, v]);
    }
    const res = await client.query(query, params);
    cb(undefined, res);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    cb(err);
  }
  process.exit();
}
