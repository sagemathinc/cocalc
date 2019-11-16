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
import { callback2 } from "smc-util/async-utils";

// SMC libraries
import * as misc from "smc-util/misc";
import { webapp_client } from "../webapp-client";
import { SyncDB } from "smc-util/sync/editor/db/sync";
import { CourseActions } from "./actions";
import { CourseStore } from "./store";
import { AppRedux } from "../app-framework";

export function create_sync_db(
  redux: AppRedux,
  actions: CourseActions,
  store: CourseStore,
  filename: string
): SyncDB {
  if (redux == null || actions == null || store == null) {
    // just in case non-typescript code uses this...
    throw Error("redux, actions and store must not be null");
  }

  const project_id = store.get("course_project_id");
  const path = store.get("course_filename");
  actions.setState({ loading: true });

  const syncdb = webapp_client.sync_db2({
    project_id,
    path,
    primary_keys: ["table", "handout_id", "student_id", "assignment_id"],
    string_cols: ["note", "description", "title", "email_invite"],
    change_throttle: 500, // helps when doing a lot of assign/collect, etc.
    save_interval: 3000
  }); // wait at least 3s between saving changes to backend

  syncdb.once("error", err => {
    if (!actions.is_closed()) {
      actions.set_error(err);
    }
    console.warn(`Error using '${store.get("course_filename")}' -- ${err}`);
  });

  syncdb.once("ready", async () => {
    const i = store.get("course_filename").lastIndexOf(".");
    const t = {
      settings: {
        title: store.get("course_filename").slice(0, i),
        description: "No description",
        allow_collabs: true
      },
      assignments: {},
      students: {},
      handouts: {},
      loading: false
    };
    for (const x of syncdb.get().toJS()) {
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
    for (const k in t) {
      const v = t[k];
      t[k] = fromJS(v);
    }
    if (!actions.is_closed()) {
      (actions as any).setState(t); // TODO: as any since t is an object, not immutable.js map...
    }
    syncdb.on("change", changes => {
      if (!actions.is_closed()) {
        actions._syncdb_change(changes);
      }
    });

    syncdb.on("after-change", () =>
      redux.getProjectActions(project_id).flag_file_activity(filename)
    );

    const p = redux.getProjectActions(store.get("course_project_id"));
    if (p != null) {
      p.log_opened_time(store.get("course_filename"));
    }

    // Wait until the projects store has data about users of our project before configuring anything.
    const projects_store = redux.getStore("projects");
    try {
      await callback2(projects_store.wait, {
        until(p_store) {
          return p_store.get_users(project_id) != null;
        },
        timeout: 60
      });
    } catch (err) {
      return; // something is very broken (or maybe admin view)...
    }
    if (actions.is_closed()) {
      return;
    }
    actions.lookup_nonregistered_students();
    actions.configure_all_projects();

    // Also
    projects_store.on(
      "change",
      actions.handle_projects_store_update.bind(actions)
    );
    actions.handle_projects_store_update(projects_store);
  });

  return syncdb;
}
