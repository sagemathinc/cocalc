/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as fs from "fs";

import { execute_code } from "@cocalc/backend/misc_node";
import { callback2 as cb2, mapParallelLimit } from "@cocalc/util/async-utils";
import * as misc from "@cocalc/util/misc";
import type { CB } from "@cocalc/util/types/database";

import { type BackupTables, getBackupTables } from "./utils";

const { defaults } = misc;
const required = defaults.required;

type RestoreTableContext = {
  _database: string;
  _host: string;
  _password: string;
  _user: string;
  _dbg: (desc: string) => Function;
  _query: (opts) => void;
};

type RestoreTablesContext = RestoreTableContext;

export type RestoreTableOptions = {
  table: string;
  path?: string;
  cb?: CB;
};

export type RestoreTablesOptions = {
  tables?: BackupTables;
  path?: string;
  limit?: number;
  cb?: CB;
};

function normalizeRestoreTableOptions(opts: RestoreTableOptions): {
  table: string;
  path: string;
  cb?: CB;
} {
  return defaults(opts, {
    table: required,
    path: "backup",
    cb: undefined,
  }) as {
    table: string;
    path: string;
    cb?: CB;
  };
}

function normalizeRestoreTablesOptions(opts: RestoreTablesOptions): {
  tables?: BackupTables;
  path: string;
  limit: number;
  cb?: CB;
} {
  return defaults(opts, {
    tables: undefined,
    path: "/backup/postgres",
    limit: 5,
    cb: undefined,
  }) as {
    tables?: BackupTables;
    path: string;
    limit: number;
    cb?: CB;
  };
}

export async function restoreTable(
  db: RestoreTableContext,
  opts: RestoreTableOptions,
): Promise<void> {
  const { table, path } = normalizeRestoreTableOptions(opts);
  const dbg = db._dbg(`_restore_table(table='${table}')`);
  dbg("dropping existing table if it exists");
  await cb2(db._query, {
    query: `DROP TABLE IF EXISTS ${table}`,
  });
  const command = `time pg_restore -C -d ${db._database} ${path}/${table}.bak`;
  dbg(command);
  await cb2(execute_code, {
    command,
    timeout: 0,
    home: ".",
    env: {
      PGPASSWORD: db._password,
      PGUSER: db._user,
      PGHOST: db._host,
    },
    err_on_exit: true,
  });
}

export function restoreTableCB(
  db: RestoreTableContext,
  opts: RestoreTableOptions & { cb: CB },
): void {
  const normalized = defaults(opts, {
    table: required,
    path: "backup",
    cb: required,
  }) as RestoreTableOptions & { cb: CB };
  restoreTable(db, normalized)
    .then(() => normalized.cb())
    .catch((err) => normalized.cb(err));
}

export async function restoreTables(
  db: RestoreTablesContext,
  opts: RestoreTablesOptions,
): Promise<void> {
  const { tables, path, limit } = normalizeRestoreTablesOptions(opts);
  const backedUpTables = fs
    .readdirSync(path)
    .filter((filename) => filename.endsWith(".bak"))
    .map((filename) => filename.slice(0, -4));
  const tableList = tables == null ? backedUpTables : getBackupTables(tables);
  for (const table of tableList) {
    if (!backedUpTables.includes(table)) {
      throw `there is no backup of '${table}'`;
    }
  }
  const dbg = db._dbg("restore_tables()");
  dbg(`restoring tables: ${misc.to_json(tableList)}`);
  await mapParallelLimit(
    tableList,
    (table) => restoreTable(db, { table, path }),
    limit,
  );
}

export function restoreTablesCB(
  db: RestoreTablesContext,
  opts: RestoreTablesOptions & { cb: CB },
): void {
  const normalized = defaults(opts, {
    tables: undefined,
    path: "/backup/postgres",
    limit: 5,
    cb: required,
  }) as RestoreTablesOptions & { cb: CB };
  restoreTables(db, normalized)
    .then(() => normalized.cb())
    .catch((err) => normalized.cb(err));
}
