/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
PostgreSQL database entry point.
Do not import any of the submodules directly unless you
know exactly what you're doing.

COPYRIGHT : (c) 2021 SageMath, Inc.
*/

import { extend_PostgreSQL as extendPostgresOps } from "./postgres-ops";
import { setupRecordConnectErrors } from "./postgres/record-connect-error";
import { PostgreSQL } from "./postgres/types";

const base = require("./postgres-base");
const postgresServerQueries = require("./postgres-server-queries");
const postgresBlobs = require("./postgres-blobs");
// Migrated to TypeScript: user-query/queries.ts
import { extend_PostgreSQL as extendPostgresUserQueries } from "./user-query/queries";
// Migrated to TypeScript: synctable/methods.ts
import { extend_PostgreSQL as extendPostgresSynctable } from "./synctable/methods";

export const {
  pg_type,
  expire_time,
  one_result,
  all_results,
  count_result,
  PROJECT_COLUMNS,
  PUBLIC_PROJECT_COLUMNS,
} = base;

// Add further functionality to PostgreSQL class -- must be at the bottom of this file.
// Each of the following calls composes the PostgreSQL class with further important functionality.
// Order matters.

let theDB: PostgreSQL | undefined = undefined;

export function db(opts = {}): PostgreSQL {
  if (theDB === undefined) {
    let PostgreSQL = base.PostgreSQL;

    PostgreSQL = postgresServerQueries.extend_PostgreSQL(PostgreSQL);
    PostgreSQL = postgresBlobs.extend_PostgreSQL(PostgreSQL);
    PostgreSQL = extendPostgresSynctable(PostgreSQL);
    PostgreSQL = extendPostgresUserQueries(PostgreSQL);
    PostgreSQL = extendPostgresOps(PostgreSQL);
    const theDBnew = new PostgreSQL(opts);
    setupRecordConnectErrors(theDBnew);
    theDB = theDBnew;
  }

  if (theDB == null) {
    throw new Error("Fatal error setting up PostgreSQL instance");
  }
  return theDB;
}

import getPool from "./pool";
export { stripNullFields } from "./postgres/util";
export { getPool };
