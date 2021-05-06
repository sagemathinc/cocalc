/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

require("coffeescript/register"); /* so we can require coffeescript */
require("coffee2-cache"); /* so coffeescript doesn't get recompiled every time we require it */

exports["compute-client"] = require("./compute-client");
exports["compute-server"] = require("./compute-server");
exports.hub = require("./hub.coffee");
exports.postgres = require("./postgres");
exports.smc_gcloud = require("./smc_gcloud");
exports.storage = require("./storage");
