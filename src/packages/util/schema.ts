/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// RECENT_TIMES = these times in minutes are used for active/recently edited
// projects and accounts in postgres-server-queries.coffee's get_stats.
// This translates the semantic meanings to the keys used in the DB, also
// prevents typos!

export { RECENT_TIMES, RECENT_TIMES_KEY } from "./schema-static";

export { SCHEMA, client_db, site_settings_conf } from "./db-schema";

// Load the syncstring extensions to the schema
import "./syncstring_schema";

// Will import some other modules and make them available here, since the code
// used to be in this file, and this is assumed in code elsewhere.  Will change later.
export { COMPUTE_STATES } from "./compute-states";
export {
  upgrades as PROJECT_UPGRADES,
  DEFAULT_QUOTAS,
  CURRENT_DATE as UPGRADES_CURRENT_DATE,
} from "./upgrade-spec";
