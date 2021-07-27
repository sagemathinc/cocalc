/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

module.exports = () => {
  if (!process.env.COCALC_PROJECT_ID) {
    // not in cocalc or building for production
    return undefined;
  }

  if (process.env.BASE_PATH) {
    return process.env.BASE_PATH;
  }

  return `/${process.env.COCALC_PROJECT_ID}/port/3000`;
};
