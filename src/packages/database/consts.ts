/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Constants related to the database.

import getLogger from "@cocalc/backend/logger";
const L = getLogger("db:consts");

/**
 * this is a limit for each query, unless timeout_s is specified.
 * https://postgresqlco.nf/en/doc/param/statement_timeout/
 */
export const STATEMENT_TIMEOUT_MS =
  1000 *
  (process.env.PG_STATEMENT_TIMEOUT_S
    ? parseInt(process.env.PG_STATEMENT_TIMEOUT_S)
    : 30);

L.debug(`STATEMENT_TIMEOUT_MS=${STATEMENT_TIMEOUT_MS}ms`);
