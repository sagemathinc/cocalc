/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "./types";

/*
This is a virtual table to make it simple from clients to
query about all usage ever of a specific file or directory
tree by a given user.

The usage times are the union of times both when patches
and times when the file was accessed.  Thus this would be
useful to see if a user opened a PDF file, say, even though
they didn't edit it.
*/

const LIMIT = 1000;

Table({
  name: "file_use_times",
  fields: {
    project_id: {
      type: "uuid",
      desc: "id of a project",
    },
    account_id: {
      type: "uuid",
      desc: "id of a user",
    },
    path: {
      type: "string",
      desc: "path to a specific file in the project",
    },
    edit_times: {
      type: "array",
      desc: `array of times (as ms since epoch) when the file was edited by the given account_id, sorted from newest to oldest. At most ${LIMIT} values are returned.`,
    },
    access_times: {
      type: "array",
      desc: `array of times (as ms since epoch) when the file was accessed by the given account_id, sorted from newest to oldest.   At most ${LIMIT} values are returned.`,
    },
  },
  rules: {
    virtual: true, // don't make an actual table
    desc: "File usage information.",
    anonymous: false,
    primary_key: ["project_id", "path"],
    user_query: {
      get: {
        options: [{ limit: LIMIT }], // todo -- add an option to trim the number of results by lowering resolution?
        fields: {
          project_id: null,
          account_id: null,
          path: null,
          access_times: null,
          edit_times: null,
        },
        // Actual query is implemented using this code below rather than an actual query directly.
        async instead_of_query(database, opts, cb): Promise<void> {
          const obj: any = Object.assign({}, opts.query);
          const { project_id, account_id, path } = obj;
          if (project_id == null || account_id == null || path == null) {
            cb("project_id, account_id, and path must all be specified");
            return;
          }
          const edit_times = obj.edit_times === null;
          const access_times = obj.access_times === null;
          if (!edit_times && !access_times) {
            // dumb -- nothing to do; but let's make this edge case work, of course.
            cb(undefined, obj);
            return;
          }
          let limit = LIMIT;
          if (opts.options && opts.options[0] && opts.options[0].limit) {
            // hackishly only support limit option.
            limit = opts.options[0].limit;
          }
          try {
            const x = await database.file_use_times({
              project_id,
              account_id,
              user_account_id: opts.account_id,
              path,
              limit,
              access_times,
              edit_times,
            });
            if (access_times) {
              obj.access_times = x.access_times;
            }
            if (edit_times) {
              obj.edit_times = x.edit_times;
            }
            cb(undefined, obj);
          } catch (err) {
            cb(err);
          }
        },
      },
    },
  },
});
