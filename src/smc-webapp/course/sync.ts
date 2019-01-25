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

import { fromJS } from "immutable";

// SMC libraries
const misc = require("smc-util/misc");
const { webapp_client } = require("../webapp_client");

export let create_sync_db = (redux, actions, store, filename) => {
  if (redux == null || actions == null || store == null) {
    return;
  }

  const project_id = store.get("course_project_id");
  const path = store.get("course_filename");

  const syncdb = webapp_client.sync_db2({
    project_id,
    path,
    primary_keys: ["table", "handout_id", "student_id", "assignment_id"],
    string_cols: ["note", "description", "title", "email_invite"],
    change_throttle: 500, // helps when doing a lot of assign/collect, etc.
    save_interval: 3000
  }); // wait at least 3s between saving changes to backend

  syncdb.once("error", err => {
    if (actions != null) {
      actions.set_error(err);
    }
    console.warn(`Error using '${store.course_filename}' -- ${err}`);
  });

  syncdb.once("ready", () => {
    const i = store.get("course_filename").lastIndexOf(".");
    const t = {
      settings: {
        title: store.get("course_filename").slice(0, i),
        description: "No description",
        allow_collabs: true
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
      t[k] = fromJS(v);
    }
    if (actions != null) {
      actions.setState(t);
    }
    syncdb.on("change", changes => {
      if (actions != null) {
        actions._syncdb_change(changes);
      }
    });

    syncdb.on("after-change", () =>
      redux.getProjectActions(project_id).flag_file_activity(filename)
    );

    // Wait until the projects store has data about users of our project before configuring anything.
    const projects_store = redux.getStore("projects");
    projects_store.wait({
      until(p_store) {
        return p_store.get_users(project_id) != null;
      },
      timeout: 30,
      cb() {
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

    const p = redux.getProjectActions(store.get("course_project_id"));
    if (p != null) {
      p.log_opened_time(store.get("course_filename"));
    }
  });

  return syncdb;
};
