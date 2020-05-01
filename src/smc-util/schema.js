/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// NOTE: we can't convert this to typescript until converting

const constants = require("./schema-static");

// these times in minutes are used for active/recently edited projects and accounts in postgres-server-queries.coffee's get_stats
exports.RECENT_TIMES = constants.RECENT_TIMES;

// this translates the semantic meanings to the keys used in the DB, also prevents typos!
exports.RECENT_TIMES_KEY = constants.RECENT_TIMES_KEY;

const db_schema = require("./db-schema");
exports.SCHEMA = db_schema.SCHEMA;
exports.client_db = db_schema.client_db;
exports.site_settings_conf = db_schema.site_settings_conf;

// Load the syncstring extensions to the schema
require("./syncstring_schema");

// Will import some other modules and make them available here, since the code
// used to be in this file, and this is assumed in code elsewhere.  Will change later.

exports.COMPUTE_STATES = require("./compute-states").COMPUTE_STATES;

const upgrade_spec = require("./upgrade-spec");
exports.PROJECT_UPGRADES = upgrade_spec.upgrades;

exports.DEFAULT_QUOTAS = upgrade_spec.DEFAULT_QUOTAS;
exports.UPGRADES_CURRENT_DATE = upgrade_spec.CURRENT_DATE;
