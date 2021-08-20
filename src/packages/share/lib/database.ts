/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { dbPassword } from "@cocalc/util-node/data";

import { Pool } from "pg";
const pool = new Pool({ password: dbPassword() });

export default function getPool() {
  return pool;
}

export function timeInSeconds(field: string, asField?: string): string {
  return ` EXTRACT(EPOCH FROM ${field})*1000 as ${asField ?? field} `;
}
