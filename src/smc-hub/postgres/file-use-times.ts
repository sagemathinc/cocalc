/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { callback2 } from "../smc-util/async-utils";
import { PostgreSQL } from "./types";
import { query } from "./query";

interface Options {
  project_id: string;
  path: string;
  account_id: string; // who the request is about
  user_account_id: string; // who is making the request
  limit: number; // at most this many timestamps
  access_times?: boolean; // if true, include access times
  edit_times?: boolean; // if true, return edit times.
}

type Response = { access_times?: number[]; edit_times?: number[] };

export async function file_use_times(
  db: PostgreSQL,
  opts: Options
): Promise<Response> {
  if (!opts.access_times && !opts.edit_times) {
    // trivial edge case.
    return {};
  }
  // Verify that that user has access.  Throws exception if not allowed.
  if (
    !(await callback2(db.user_is_in_project_group.bind(db), {
      account_id: opts.user_account_id,
      project_id: opts.project_id,
      cache: true,
    }))
  ) {
    throw Error("user does not have read access to the given project");
  }

  const resp: Response = {};

  if (opts.access_times) {
    // Query the file_access_log file.
    const file_access_times: { time: Date }[] = await query({
      db,
      table: "file_access_log",
      select: ["time"],
      where: {
        project_id: opts.project_id,
        filename: opts.path,
        account_id: opts.account_id,
      },
      one: false,
      order_by: "time desc",
      limit: opts.limit,
    });
    resp.access_times = [];
    for (const d of file_access_times) {
      resp.access_times.push(d.time.valueOf());
    }
  }

  // The patches data
  if (opts.edit_times) {
    const string_id = db.sha1(opts.project_id, opts.path);
    const edit_times: { time: Date }[] = await query({
      db,
      table: "patches",
      select: ["time"],
      where: { string_id },
      one: false,
      order_by: "time desc",
      limit: opts.limit,
    });
    resp.edit_times = [];
    for (const d of edit_times) {
      resp.edit_times.push(d.time.valueOf());
    }
  }

  return resp;
}
