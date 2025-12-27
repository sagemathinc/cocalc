/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { execute_code } from "@cocalc/backend/misc_node";
import { callback2 as cb2, mapParallelLimit } from "@cocalc/util/async-utils";
import * as misc from "@cocalc/util/misc";
import type { CB } from "@cocalc/util/types/database";

import { type BackupTables, getBackupTables } from "./utils";

const { defaults } = misc;
const required = defaults.required;

type BackupTableContext = {
  _database: string;
  _host: string;
  _password: string;
  _dbg: (desc: string) => Function;
};

type BackupBupContext = {
  _dbg: (desc: string) => Function;
};

type BackupTablesContext = BackupTableContext & BackupBupContext;

export type BackupTableOptions = {
  table: string;
  path?: string;
  cb?: CB;
};

export type BackupBupOptions = {
  path?: string;
  cb?: CB;
};

export type BackupTablesOptions = {
  tables: BackupTables;
  path?: string;
  limit?: number;
  bup?: boolean;
  cb?: CB;
};

function normalizeBackupTableOptions(opts: BackupTableOptions): {
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

function normalizeBackupBupOptions(opts: BackupBupOptions): {
  path: string;
  cb?: CB;
} {
  return defaults(opts, {
    path: "backup",
    cb: undefined,
  }) as {
    path: string;
    cb?: CB;
  };
}

function normalizeBackupTablesOptions(opts: BackupTablesOptions): {
  tables: BackupTables;
  path: string;
  limit: number;
  bup: boolean;
  cb?: CB;
} {
  return defaults(opts, {
    tables: required,
    path: "backup",
    limit: 3,
    bup: true,
    cb: undefined,
  }) as {
    tables: BackupTables;
    path: string;
    limit: number;
    bup: boolean;
    cb?: CB;
  };
}

export async function backupTable(
  db: BackupTableContext,
  opts: BackupTableOptions,
): Promise<void> {
  const { table, path } = normalizeBackupTableOptions(opts);
  const dbg = db._dbg(`_backup_table(table='${table}')`);
  const command = `mkdir -p ${path}; time pg_dump -Fc --table ${table} ${db._database} > ${path}/${table}.bak`;
  dbg(command);
  await cb2(execute_code, {
    command,
    timeout: 0,
    home: ".",
    env: {
      PGPASSWORD: db._password,
      PGUSER: "smc",
      PGHOST: db._host,
    },
    err_on_exit: true,
  });
}

export function backupTableCB(
  db: BackupTableContext,
  opts: BackupTableOptions & { cb: CB },
): void {
  const normalized = defaults(opts, {
    table: required,
    path: "backup",
    cb: required,
  }) as BackupTableOptions & { cb: CB };
  backupTable(db, normalized)
    .then(() => normalized.cb())
    .catch((err) => normalized.cb(err));
}

export async function backupBup(
  db: BackupBupContext,
  opts: BackupBupOptions,
): Promise<void> {
  const { path } = normalizeBackupBupOptions(opts);
  const dbg = db._dbg(`_backup_bup(path='${path}')`);
  const command = `mkdir -p '${path}' && export  && bup init && bup index '${path}' && bup save --strip --compress=0 '${path}' -n master`;
  dbg(command);
  await cb2(execute_code, {
    command,
    timeout: 0,
    home: ".",
    env: {
      BUP_DIR: `${path}/.bup`,
    },
    err_on_exit: true,
  });
}

export function backupBupCB(
  db: BackupBupContext,
  opts: BackupBupOptions & { cb: CB },
): void {
  const normalized = defaults(opts, {
    path: "backup",
    cb: required,
  }) as BackupBupOptions & { cb: CB };
  backupBup(db, normalized)
    .then(() => normalized.cb())
    .catch((err) => normalized.cb(err));
}

export async function backupTables(
  db: BackupTablesContext,
  opts: BackupTablesOptions,
): Promise<void> {
  const normalized = normalizeBackupTablesOptions(opts);
  const tableList = getBackupTables(normalized.tables);
  const dbg = db._dbg("backup_tables()");
  dbg(`backing up tables: ${misc.to_json(tableList)}`);
  await mapParallelLimit(
    tableList,
    (table) => backupTable(db, { table, path: normalized.path }),
    normalized.limit,
  );
  await backupBup(db, { path: normalized.path });
}

export function backupTablesCB(
  db: BackupTablesContext,
  opts: BackupTablesOptions & { cb: CB },
): void {
  const normalized = defaults(opts, {
    tables: required,
    path: "backup",
    limit: 3,
    bup: true,
    cb: required,
  }) as BackupTablesOptions & { cb: CB };
  backupTables(db, normalized)
    .then(() => normalized.cb())
    .catch((err) => normalized.cb(err));
}
