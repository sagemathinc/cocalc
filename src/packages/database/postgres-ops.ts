/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { CB } from "@cocalc/util/types/database";

import {
  backupBupCB,
  backupTableCB,
  backupTablesCB,
  getBackupTables,
  restoreTableCB,
  restoreTablesCB,
  type BackupBupOptions,
  type BackupTableOptions,
  type BackupTables,
  type BackupTablesOptions,
  type RestoreTableOptions,
  type RestoreTablesOptions,
} from "./postgres/ops";
import type { PostgreSQL as PostgreSQLInterface } from "./postgres/types";

type PostgreSQLConstructor = new (...args: any[]) => PostgreSQLInterface;

export function extend_PostgreSQL<TBase extends PostgreSQLConstructor>(
  ext: TBase,
): TBase {
  return class PostgreSQL extends ext {
    backup_tables(opts: BackupTablesOptions & { cb: CB }): void {
      backupTablesCB(this, opts);
    }

    _backup_table(opts: BackupTableOptions & { cb: CB }): void {
      backupTableCB(this, opts);
    }

    _backup_bup(opts: BackupBupOptions & { cb: CB }): void {
      backupBupCB(this, opts);
    }

    _get_backup_tables(tables: BackupTables): string[] {
      return getBackupTables(tables);
    }

    restore_tables(opts: RestoreTablesOptions & { cb: CB }): void {
      restoreTablesCB(this, opts);
    }

    _restore_table(opts: RestoreTableOptions & { cb: CB }): void {
      restoreTableCB(this, opts);
    }
  };
}
