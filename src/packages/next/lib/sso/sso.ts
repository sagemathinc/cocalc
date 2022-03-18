/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import { capitalize } from "@cocalc/util/misc";
import { sortBy } from "lodash";
import { SSO } from "./types";

const SQL_SELECT =
  "SELECT strategy, conf ->> 'display' as display, conf ->> 'icon' as icon, info";

interface Row {
  strategy: string;
  display?: string;
  info?: any;
  icon?: string;
}

function parseRow(row: Row): SSO | undefined {
  const { strategy, info, icon } = row;
  return {
    id: strategy,
    display: info.display ?? capitalize(strategy),
    domains: info?.exclusive_domains ?? [],
    descr: info?.description ?? null,
    icon,
  };
}

export async function getSSO(): Promise<SSO[]> {
  const pool = getPool("long");
  const { rows } = await pool.query(`
    ${SQL_SELECT}
    FROM passport_settings
    WHERE coalesce(info ->> 'public', 'true')::BOOL = FALSE`);
  const data = rows.map((row) => parseRow(row));
  return sortBy(data, (sso) => sso.display);
}

export async function getOneSSO(id: string): Promise<SSO | undefined> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    `${SQL_SELECT}
     FROM passport_settings
     WHERE strategy=$1`,
    [id]
  );
  if (rows.length === 0) return;
  return parseRow(rows[0]);
}
