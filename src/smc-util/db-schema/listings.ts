/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Table of directory listings.
*/

import { Table } from "./types";

export const WATCH_TIMEOUT_MS = 60000;

// Maximum number of paths to keep in listings tables for this project.
// NOTE: for now we're just using a limit query to only load this many
// when initializing things. We might have more in the database until
// synctable.delete gets fully and properly initialized.  The main goal
// is to not waste bandwidth and memory in browsers.
export const MAX_PATHS = 25;

// Maximum number of entries in a directory listing.  If this is exceeded
// we sort by last modification time, take only the first MAX_FILES_PER_PATH
// most recent entries, and set missing to the number that are missing.
export const MAX_FILES_PER_PATH = 100;

Table({
  name: "listings",
  fields: {
    project_id: {
      type: "uuid",
      desc: "The project id.",
    },
    path: {
      type: "string",
      desc:
        "The directory that this is a listing of.  Should not start or end with a slash and is relative to home directory of project.",
    },
    time: {
      type: "timestamp",
      desc: "When this directory listing was obtained.",
    },
    interest: {
      type: "timestamp",
      desc:
        "When a browser last said 'I care about contents of this directory'.",
    },
    listing: {
      type: "array",
      pg_type: "JSONB[]",
      desc: "The directory listing itself.",
    },
    missing: {
      type: "number",
      desc:
        "If the listing is truncated due to being too large this is the number of missing entries.  The oldest entries are missing.",
    },
    error: {
      type: "string",
      desc:
        "Set if there is an error computing the directory listing, e.g., if there is no directory this may happen.  This will be cleared once the listing is successfully computed.",
    },
    deleted: {
      type: "array",
      pg_type: "TEXT[]",
      desc:
        "Paths within this directory that have been explicitly deleted by a user",
    },
    git_dir: {
      type: "string",
      desc:
        "For the given directory, either the absolute path of an associated Git directory or null.",
    },
  },
  rules: {
    desc: "Directory listings in projects",
    primary_key: ["project_id", "path"],
    user_query: {
      get: {
        pg_where: ["projects"],
        options: [{ order_by: "-interest" }, { limit: MAX_PATHS }],
        fields: {
          project_id: null,
          path: null,
          time: null,
          listing: null,
          missing: null,
          interest: null,
          error: null,
          deleted: null,
          git_dir: null,
        },
      },
      set: {
        // users can set that they are interested in this directory and also
        // remove paths from the list of deleted paths (e.g., in case they want
        // to edit afile that was deleted).
        fields: {
          project_id: "project_id",
          path: true,
          interest: true,
          deleted: true,
        },
      },
    },

    project_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        options: [{ order_by: "-interest" }, { limit: 3 }],
        fields: {
          project_id: null,
          path: null,
          time: null,
          listing: null,
          missing: null,
          interest: null,
          error: null,
          deleted: null,
          git_dir: null,
        },
      },
      set: {
        // delete=true, since project *IS* allowed to delete entries
        // in this table (used for purging tracked listings).
        delete: true,
        fields: {
          project_id: "project_id",
          path: true,
          listing: true,
          missing: true,
          time: true,
          interest: true,
          error: true,
          deleted: true,
          git_dir: null,
        },
      },
    },
  },
});
