/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// PostgreSQL synctable methods
// Migrated from postgres-synctable.coffee

import async from "async";

import * as misc from "@cocalc/util/misc";
import type { CB } from "@cocalc/util/types/callback";

import type {
  ChangefeedOptions,
  ChangefeedSelect,
  PostgreSQL as PostgreSQLType,
  ProjectAndUserTrackerOptions,
  SyncTableOptions,
} from "../postgres/types";
import type { Changes } from "../postgres/changefeed/changefeed";
import type { ProjectAndUserTracker } from "../postgres/project/project-and-user-tracker";

import { trigger_code, trigger_name } from "./trigger";
import { SyncTable } from "./synctable";

type ChangesConstructor =
  typeof import("../postgres/changefeed/changefeed").Changes;
type ProjectAndUserTrackerConstructor =
  typeof import("../postgres/project/project-and-user-tracker").ProjectAndUserTracker;

type SynctableState = {
  _listening?: Record<string, number>;
  _project_and_user_tracker?: ProjectAndUserTracker;
  _project_and_user_tracker_cbs?: Array<CB<ProjectAndUserTracker>>;
};

type SynctableDB = PostgreSQLType &
  SynctableState & {
    _ensure_trigger_exists: (
      table: string,
      select: ChangefeedSelect,
      watch: string[],
      cb: CB,
    ) => void;
  };

// Lazy-load Changes and ProjectAndUserTracker to allow Jest mocks to work
function getChanges(): ChangesConstructor {
  return require("../postgres/changefeed/changefeed")
    .Changes as ChangesConstructor;
}

function getProjectAndUserTracker(): ProjectAndUserTrackerConstructor {
  return require("../postgres/project/project-and-user-tracker")
    .ProjectAndUserTracker as ProjectAndUserTrackerConstructor;
}

export function _ensure_trigger_exists(
  db: SynctableDB,
  table: string,
  select: ChangefeedSelect,
  watch: string[],
  cb: CB,
) {
  const dbg = db._dbg(`_ensure_trigger_exists(${table})`);
  dbg(`select=${misc.to_json(select)}`);
  if (misc.len(select) === 0) {
    cb("there must be at least one column selected");
    return;
  }
  const tgname = trigger_name(table, select, watch);
  let trigger_exists: boolean | undefined = undefined;
  async.series(
    [
      (cb) => {
        dbg("checking whether or not trigger exists");
        db._query({
          query: `SELECT count(*) FROM pg_trigger WHERE tgname = '${tgname}'`,
          cb: (err, result) => {
            if (err) {
              cb(err);
            } else {
              if (!result) {
                cb("missing trigger check result");
                return;
              }
              trigger_exists = parseInt(result.rows[0].count) > 0;
              cb();
            }
          },
        });
      },
      (cb) => {
        if (trigger_exists) {
          dbg(`trigger ${tgname} already exists`);
          cb();
          return;
        }
        dbg(`creating trigger ${tgname}`);
        const code = trigger_code(table, select, watch);
        async.series(
          [
            (cb) => {
              db._query({
                query: code.function,
                cb,
              });
            },
            (cb) => {
              db._query({
                query: code.trigger,
                cb,
              });
            },
          ],
          cb,
        );
      },
    ],
    cb,
  );
}

export function _listen(
  db: SynctableDB,
  table: string,
  select: ChangefeedSelect,
  watch: string[],
  cb?: CB<string>,
) {
  const dbg = db._dbg(`_listen(${table})`);
  dbg(`select = ${misc.to_json(select)}`);
  if (!misc.is_object(select)) {
    cb?.("select must be an object");
    return;
  }
  if (misc.len(select) === 0) {
    cb?.("there must be at least one column");
    return;
  }
  if (!misc.is_array(watch)) {
    cb?.("watch must be an array");
    return;
  }
  db._listening ??= {};
  const tgname = trigger_name(table, select, watch);
  if ((db._listening[tgname] ?? 0) > 0) {
    dbg("already listening");
    db._listening[tgname] += 1;
    cb?.(undefined, tgname);
    return;
  }
  async.series(
    [
      (cb) => {
        dbg("ensure trigger exists");
        db._ensure_trigger_exists(table, select, watch, cb);
      },
      (cb) => {
        dbg("add listener");
        db._query({
          query: `LISTEN ${tgname}`,
          cb,
        });
      },
    ],
    (err) => {
      if (err) {
        dbg(`fail: err = ${err}`);
        cb?.(err);
      } else {
        db._listening![tgname] ??= 0;
        db._listening![tgname] += 1;
        dbg("success");
        cb?.(undefined, tgname);
      }
    },
  );
}

export function _notification(
  db: SynctableDB,
  mesg: { channel: string; payload: string },
) {
  // @_dbg('notification')(misc.to_json(mesg))  # this is way too verbose...
  db.emit(mesg.channel, JSON.parse(mesg.payload));
}

export function _stop_listening(
  db: SynctableDB,
  table: string,
  select: Record<string, string>,
  watch: string[],
  cb?: CB,
) {
  db._listening ??= {};
  const tgname = trigger_name(table, select, watch);
  if (db._listening[tgname] == null || db._listening[tgname] === 0) {
    cb?.();
    return;
  }
  if (db._listening[tgname] > 0) {
    db._listening[tgname] -= 1;
  }
  if (db._listening[tgname] === 0) {
    db._query({
      query: `UNLISTEN ${tgname}`,
      cb,
    });
  }
}

/**
 * Server-side changefeed-updated table, which automatically restarts changefeed
 * on error, etc. See SyncTable docs where the class is defined.
 */
export function synctable(
  db: SynctableDB,
  opts: SyncTableOptions,
): SyncTable | undefined {
  const options = misc.defaults(opts, {
    table: misc.required,
    columns: undefined,
    where: undefined,
    limit: undefined,
    order_by: undefined,
    where_function: undefined,
    idle_timeout_s: undefined, // TODO: currently ignored
    cb: undefined,
  });
  return new SyncTable(
    db,
    options.table,
    options.columns,
    options.where,
    options.where_function,
    options.limit,
    options.order_by,
    options.cb,
  );
}

export function changefeed(
  db: SynctableDB,
  opts: ChangefeedOptions,
): Changes | undefined {
  const options = misc.defaults(opts, {
    table: misc.required,
    select: misc.required,
    watch: misc.required,
    where: misc.required,
    cb: misc.required,
  });
  const Changes = getChanges();
  return new Changes(
    db,
    options.table,
    options.select,
    options.watch,
    options.where,
    options.cb,
  );
}

/**
 * Event emitter that tracks changes to users of a project, and collabs of a user.
 * If it emits 'error' -- which it can and will do sometimes -- then
 * any client of this tracker must give up on using it!
 */
export async function project_and_user_tracker(
  db: SynctableDB,
  opts: ProjectAndUserTrackerOptions,
): Promise<void> {
  const options = misc.defaults(opts, { cb: misc.required });
  if (db._project_and_user_tracker != null) {
    options.cb(undefined, db._project_and_user_tracker);
    return;
  }
  db._project_and_user_tracker_cbs ??= [];
  db._project_and_user_tracker_cbs.push(options.cb);
  if (db._project_and_user_tracker_cbs.length > 1) {
    return;
  }
  const ProjectAndUserTracker = getProjectAndUserTracker();
  const tracker = new ProjectAndUserTracker(db);
  tracker.once("error", () => {
    // delete, so that future calls create a new one.
    delete db._project_and_user_tracker;
  });
  try {
    await tracker.init();
    db._project_and_user_tracker = tracker;
    for (const cb of db._project_and_user_tracker_cbs) {
      cb(undefined, tracker);
    }
    delete db._project_and_user_tracker_cbs;
  } catch (err) {
    if (db._project_and_user_tracker_cbs) {
      for (const cb of db._project_and_user_tracker_cbs) {
        cb(err);
      }
    }
  }
}
