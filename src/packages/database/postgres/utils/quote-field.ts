/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { quoteField } from "../schema/util";

export function quote_field(field: string): string {
  return quoteField(field);
}
