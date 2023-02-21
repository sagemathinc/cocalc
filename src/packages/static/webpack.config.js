/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const getConfig = require("./dist-ts/src/webpack.config").default;

module.exports = getConfig();
