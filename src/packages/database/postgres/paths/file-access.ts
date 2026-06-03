/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import { expire_time, uuid } from "@cocalc/util/misc";
import type { PostgreSQL } from "../types";
import { pii_expire } from "../account/pii";

export interface LogFileAccessOptions {
  project_id: string;
  account_id: string;
  filename: string;
}

/**
 * Log file access to the file_access_log table.
 * This is throttled (60 seconds) to prevent duplicate entries from the same
 * project/account/filename combination within a minute.
 *
 * Note: Multiple servers may still create entries within the same minute.
 */
export async function log_file_access(
  db: PostgreSQL,
  opts: LogFileAccessOptions,
): Promise<void> {
  // Throttle: if called with same input within 60s, ignore
  if (
    db._throttle(
      "log_file_access",
      60,
      opts.project_id,
      opts.account_id,
      opts.filename,
    )
  ) {
    return;
  }

  // If no PII expiration is set, use 1 year as a fallback
  const expire = (await pii_expire()) ?? expire_time(365 * 24 * 60 * 60);

  await callback2(db._query.bind(db), {
    query: "INSERT INTO file_access_log",
    values: {
      "id         :: UUID     ": uuid(),
      "project_id :: UUID     ": opts.project_id,
      "account_id :: UUID     ": opts.account_id,
      "filename   :: TEXT     ": opts.filename,
      "time       :: TIMESTAMP": "NOW()",
      "expire     :: TIMESTAMP": expire,
    },
  });
}

export interface GetFileAccessOptions {
  start?: Date;
  end?: Date;
  project_id?: string;
  account_id?: string;
  filename?: string;
}

export interface FileAccessEntry {
  project_id: string;
  account_id: string;
  filename: string;
  time: Date;
}

/**
 * Get all file access times subject to various constraints.
 * This allows efficient querying and slicing of file access history.
 *
 * Note: This was not available in the RethinkDB version but is now
 * easily queryable with PostgreSQL.
 */
export async function get_file_access(
  db: PostgreSQL,
  opts: GetFileAccessOptions,
): Promise<FileAccessEntry[]> {
  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT project_id, account_id, filename, time FROM file_access_log",
    where: {
      "time >= $::TIMESTAMP": opts.start,
      "time <= $::TIMESTAMP": opts.end,
      "project_id = $::UUID": opts.project_id,
      "account_id = $::UUID": opts.account_id,
      "filename   = $::TEXT": opts.filename,
    },
  });

  return rows;
}

export interface RecordFileUseOptions {
  project_id: string;
  path: string;
  account_id: string;
  action: string; // 'edit', 'read', 'seen', 'chat', etc.
}

/**
 * Record file editing activity - users modifying files in any way.
 * Uses the file_use table which also tracks whether activity has been seen by users.
 *
 * Note: This uses two queries which is ugly (see comment in db-schema about file_use table).
 * This will be redone for PostgreSQL later.
 */
export async function record_file_use(
  db: PostgreSQL,
  opts: RecordFileUseOptions,
): Promise<void> {
  const now = new Date();
  const id = db.sha1(opts.project_id, opts.path);

  const entry: any = {
    id,
    project_id: opts.project_id,
    path: opts.path,
  };

  // Set last_edited for 'edit' and 'chat' actions
  if (opts.action === "edit" || opts.action === "chat") {
    entry.last_edited = now;
  }

  // First query: INSERT with conflict resolution
  await callback2(db._query.bind(db), {
    query: "INSERT INTO file_use",
    conflict: "id",
    values: entry,
  });

  // Second query: UPDATE with JSONB merge
  await callback2(db._query.bind(db), {
    query: "UPDATE file_use",
    jsonb_merge: {
      users: { [opts.account_id]: { [opts.action]: now } },
    },
    where: { id },
  });
}

export interface GetFileUseOptions {
  max_age_s?: number;
  project_id?: string; // don't specify both project_id and project_ids
  project_ids?: string[];
  path?: string; // if given, project_id must be given
}

export interface FileUseEntry {
  id: string;
  project_id: string;
  path: string;
  last_edited?: Date;
  users?: Record<string, Record<string, Date>>;
}

/**
 * Get file use information from the file_use table.
 * Can filter by max_age_s, project_id(s), and path.
 *
 * Returns one entry if path is given, otherwise an array of entries.
 */
export async function get_file_use(
  db: PostgreSQL,
  opts: GetFileUseOptions,
): Promise<FileUseEntry | FileUseEntry[] | undefined> {
  let project_ids: string[];

  // Validate and normalize project_id/project_ids
  if (opts.project_id != null) {
    if (opts.project_ids != null) {
      throw new Error("don't specify both project_id and project_ids");
    }
    project_ids = [opts.project_id];
  } else if (opts.project_ids != null) {
    project_ids = opts.project_ids;
  } else {
    throw new Error("project_id or project_ids must be defined");
  }

  const { rows } = await callback2(db._query.bind(db), {
    query: "SELECT * FROM file_use",
    where: {
      "last_edited >= $::TIMESTAMP": opts.max_age_s
        ? new Date(Date.now() - opts.max_age_s * 1000)
        : undefined,
      "project_id   = ANY($)": project_ids,
      "path         = $::TEXT": opts.path,
    },
    order_by: "last_edited",
  });

  // Return single entry if path is specified, otherwise return all
  if (opts.path != null) {
    return rows.length > 0 ? rows[0] : undefined;
  } else {
    return rows;
  }
}
