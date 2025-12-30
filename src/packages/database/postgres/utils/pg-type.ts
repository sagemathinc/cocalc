/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { pgType } from "../schema/pg-type";

export function pg_type(info: { pg_type?: string; type?: string }): string {
  return pgType(info);
}
