/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getFeedData } from "@cocalc/database/postgres/news";

import getLogger from "@cocalc/backend/logger";

const L = getLogger("server:news:list").debug;

export async function get(params?: any) {
  L("params", params);
  return await getFeedData();
}
