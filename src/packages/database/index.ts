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
import { extend_PostgreSQL as extendPostgresServerQueries } from "./postgres-server-queries";
import { PostgreSQL } from "./postgres/types";
import {
  PROJECT_COLUMNS,
  PUBLIC_PROJECT_COLUMNS,
} from "./postgres/project/columns";
import * as base from "./postgres-base";
import { extend_PostgreSQL as extendPostgresBlobs } from "./postgres/blobs";
import { extend_PostgreSQL as extendPostgresUserQueries } from "./user-query/queries";
import { extend_PostgreSQL as extendPostgresSynctable } from "./synctable/methods";

// Export utility functions directly from their modules
export { pg_type } from "./postgres/utils/pg-type";
export { quote_field } from "./postgres/utils/quote-field";
export { expire_time } from "./postgres/utils/expire-time";
export { one_result } from "./postgres/utils/one-result";
export { all_results } from "./postgres/utils/all-results";
export { count_result } from "./postgres/utils/count-result";

// Export project columns from their TypeScript location
export { PROJECT_COLUMNS, PUBLIC_PROJECT_COLUMNS };

// Add further functionality to PostgreSQL class -- must be at the bottom of this file.
// Each of the following calls composes the PostgreSQL class with further important functionality.
// Order matters.

let theDB: PostgreSQL | undefined = undefined;

export function db(opts = {}): PostgreSQL {
  if (theDB === undefined) {
    let PostgreSQL = base.PostgreSQL;

    PostgreSQL = extendPostgresServerQueries(PostgreSQL);
    PostgreSQL = extendPostgresBlobs(PostgreSQL);
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
export { stripNullFields } from "./postgres/utils/strip-null-fields";
export { getPool };
