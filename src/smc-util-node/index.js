/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

require("coffeescript/register"); /* so we can require coffeescript */
require("coffee-cache"); /* so coffeescript doesn't get recompiled every time we require it */

exports.misc_node = require("./misc_node.coffee");
exports.sqlite = require("./sqlite.coffee");
