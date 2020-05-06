/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

/*
Requests and status related to copying files between projects.

TODO: for now there are no user queries -- this is used entirely by backend servers,
actually only in kucalc; later that may change, so the user can make copy
requests this way, check on their status, show all current copies they are
causing in a page (that is persistent over browser refreshes, etc.).
That's for later.
*/
Table({
  name: "copy_paths",
  fields: {
    id: {
      type: "uuid",
      desc: "random unique id assigned to this copy request",
    },
    time: {
      type: "timestamp",
      desc: "when this request was made",
    },
    source_project_id: {
      type: "uuid",
      desc: "the project_id of the source project",
    },
    source_path: {
      type: "string",
      desc: "the path of the source file or directory",
    },
    target_project_id: {
      type: "uuid",
      desc: "the project_id of the target project",
    },
    target_path: {
      type: "string",
      desc: "the path of the target file or directory",
    },
    overwrite_newer: {
      type: "boolean",
      desc: "if new, overwrite newer files in destination",
    },
    delete_missing: {
      type: "boolean",
      desc:
        "if true, delete files in the target that aren't in the source path",
    },
    backup: {
      type: "boolean",
      desc: "if true, make backup of files before overwriting",
    },
    public: {
      type: "boolean",
      desc:
        "if true, use files from the public share server instead of starting up the project",
    },
    bwlimit: {
      type: "string",
      desc:
        "optional limit on the bandwidth dedicated to this copy (passed to rsync)",
    },
    timeout: {
      type: "number",
      desc:
        "fail if the transfer itself takes longer than this number of seconds (passed to rsync)",
    },
    scheduled: {
      type: "timestamp",
      desc:
        "earliest time in the future, when the copy request should start (or null, for immediate execution)",
    },
    started: {
      type: "timestamp",
      desc: "when the copy request actually started running",
    },
    finished: {
      type: "timestamp",
      desc: "when the copy request finished",
    },
    error: {
      type: "string",
      desc: "if the copy failed or output any errors, they are put here.",
    },
  },
  rules: {
    primary_key: "id",

    pg_indexes: [
      "time",
      "scheduled",
      "((started IS NULL))",
      "((finished IS NULL))",
    ],
  },
});
