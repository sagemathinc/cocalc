/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import { capitalize } from "@cocalc/util/misc";
import { sortBy } from "lodash";
import { SSO } from "./types";

const SQL_SELECT = `SELECT strategy, info,
  COALESCE(info -> 'icon',              conf -> 'icon')              as icon,
  COALESCE(info -> 'display',           conf -> 'display')           as display,
  COALESCE(info -> 'exclusive_domains', conf -> 'exclusive_domains') as exclusive_domains`;

interface Row {
  strategy: string;
  display?: string;
  exclusive_domains?: string[];
  info?: any;
  icon?: string;
}

function parseRow(row: Row): SSO | undefined {
  const { strategy, exclusive_domains, display, info, icon } = row;
  return {
    id: strategy,
    display: display ?? capitalize(strategy),
    domains: exclusive_domains ?? [],
    descr: info?.description ?? null,
    icon,
  };
}

export async function getSSO(): Promise<SSO[]> {
  const pool = getPool("long");
  const { rows } = await pool.query(`
    ${SQL_SELECT}
    FROM passport_settings
    WHERE coalesce(info -> 'public', conf -> 'public', 'true'::JSONB)::BOOL IS FALSE`);
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
