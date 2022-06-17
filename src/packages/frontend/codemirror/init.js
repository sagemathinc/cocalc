/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

require("./codemirror");
require("./modes");
require("./addons");
require("./keymaps");

// We instead load this in the webpack app entry point, so that we can
// also load this stuff via next.js (eventually?) which has some significant
// constraints on when and where CSS is loaded.
//require("./css");

require("./extensions");
