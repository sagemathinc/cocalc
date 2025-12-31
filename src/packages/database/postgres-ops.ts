/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { CB } from "@cocalc/util/types/database";

import {
  backupBup,
  backupTable,
  backupTables,
  getBackupTables,
  restoreTable,
  restoreTables,
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
    async backup_tables(
      opts: BackupTablesOptions & { cb?: CB },
    ): Promise<void> {
      const { cb } = opts;
      try {
        await backupTables(this, opts);
        cb?.();
      } catch (err) {
        cb?.(err);
        if (!cb) {
          throw err;
        }
      }
    }

    async _backup_table(opts: BackupTableOptions & { cb?: CB }): Promise<void> {
      const { cb } = opts;
      try {
        await backupTable(this, opts);
        cb?.();
      } catch (err) {
        cb?.(err);
        if (!cb) {
          throw err;
        }
      }
    }

    async _backup_bup(opts: BackupBupOptions & { cb?: CB }): Promise<void> {
      const { cb } = opts;
      try {
        await backupBup(this, opts);
        cb?.();
      } catch (err) {
        cb?.(err);
        if (!cb) {
          throw err;
        }
      }
    }

    _get_backup_tables(tables: BackupTables): string[] {
      return getBackupTables(tables);
    }

    async restore_tables(
      opts: RestoreTablesOptions & { cb?: CB },
    ): Promise<void> {
      const { cb } = opts;
      try {
        await restoreTables(this, opts);
        cb?.();
      } catch (err) {
        cb?.(err);
        if (!cb) {
          throw err;
        }
      }
    }

    async _restore_table(
      opts: RestoreTableOptions & { cb?: CB },
    ): Promise<void> {
      const { cb } = opts;
      try {
        await restoreTable(this, opts);
        cb?.();
      } catch (err) {
        cb?.(err);
        if (!cb) {
          throw err;
        }
      }
    }
  };
}
