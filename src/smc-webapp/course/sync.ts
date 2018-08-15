/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

/*
Describes how the client course editor syncs with the database
*/

import * as immutable from "immutable";

// SMC libraries
const misc = require("smc-util/misc");
const { webapp_client } = require("../webapp_client");

export let create_sync_db = (redux, actions, store, filename) => {
  if (redux == null || actions == null || store == null) {
    return;
  }

  const syncdb = webapp_client.sync_db({
    project_id: store.get("course_project_id"),
    path: store.get("course_filename"),
    primary_keys: ["table", "handout_id", "student_id", "assignment_id"],
    string_cols: ["note", "description", "title", "email_invite"],
    change_throttle: 500, // helps when doing a lot of assign/collect, etc.
    save_interval: 3000,
    cursors: true // cursors is used to share presence info about who is looking at / grading which student, etc.
  }); // wait at least 3s between saving changes to backend

  syncdb.once("init", err => {
    if (err) {
      if (actions != null) {
        actions.set_error(err);
      }
      console.warn(`Error opening '${store.course_filename}' -- ${err}`);
      return;
    }
    const i = store.get("course_filename").lastIndexOf(".");
    const t = {
      settings: {
        title: store.get("course_filename").slice(0, i),
        description: "No description"
      },
      assignments: {},
      students: {},
      handouts: {}
    };
    for (let x of syncdb.get().toJS()) {
      if (x.table === "settings") {
        misc.merge(t.settings, misc.copy_without(x, "table"));
      } else if (x.table === "students") {
        t.students[x.student_id] = misc.copy_without(x, "table");
      } else if (x.table === "assignments") {
        t.assignments[x.assignment_id] = misc.copy_without(x, "table");
      } else if (x.table === "handouts") {
        t.handouts[x.handout_id] = misc.copy_without(x, "table");
      }
    }
    for (let k in t) {
      const v = t[k];
      t[k] = immutable.fromJS(v);
    }
    if (actions != null) {
      actions.setState(t);
    }
    syncdb.on(
      "change",
      changes => (actions != null ? actions._syncdb_change(changes) : undefined)
    );
    syncdb.on("sync", () =>
      redux.getProjectActions(store.project_id).flag_file_activity(filename)
    );
    syncdb.on(
      "cursor_activity",
      typeof actions !== "undefined" && actions !== null
        ? actions._syncdb_cursor_activity
        : undefined
    );

    // Wait until the projects store has data about users of our project before configuring anything.
    const projects_store = redux.getStore("projects");
    projects_store.wait({
      until(p_store) {
        return p_store.get_users(store.get("course_project_id")) != null;
      },
      timeout: 30,
      cb() {
        actions = actions;
        if (actions == null) {
          return;
        }
        actions.lookup_nonregistered_students();
        actions.configure_all_projects();
        actions._init_who_pay(); // this is just to deal with older courses that may have already paid.

        // Also
        projects_store.on("change", actions.handle_projects_store_update);
        actions.handle_projects_store_update(projects_store);
      }
    }); // initialize

    return __guard__(
      redux.getProjectActions(store.get("course_project_id")),
      x1 => x1.log_opened_time(store.get("course_filename"))
    );
  });

  return syncdb;
};
function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
