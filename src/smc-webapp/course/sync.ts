/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Describes how the client course editor syncs with the database

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

  const syncdb = webapp_client.sync_client.sync_db({
    project_id,
    path,
    primary_keys: ["table", "handout_id", "student_id", "assignment_id"],
    string_cols: ["note", "description", "title", "email_invite"],
    change_throttle: 500, // helps when doing a lot of assign/collect, etc.
  });

  syncdb.once("error", (err) => {
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
        allow_collabs: true,
      },
      assignments: {},
      students: {},
      handouts: {},
      loading: false,
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
    syncdb.on("change", (changes) => {
      if (!actions.is_closed()) {
        actions.syncdb_change(changes);
      }
    });

    syncdb.on("after-change", () =>
      redux.getProjectActions(project_id).flag_file_activity(filename)
    );

    const course_project_id = store.get("course_project_id");
    const p = redux.getProjectActions(course_project_id);
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
        timeout: 60,
      });
    } catch (err) {
      return; // something is very broken (or maybe admin view)...
    }
    if (actions.is_closed()) {
      return;
    }
    actions.students.lookup_nonregistered_students();

    const course_compute_image = actions
      .get_store()
      .getIn(["settings", "custom_image"]);
    if (course_compute_image == null) {
      const course_project_compute_image = projects_store.getIn([
        "project_map",
        course_project_id,
        "compute_image",
      ]);
      actions.set(
        { custom_image: course_project_compute_image, table: "settings" },
        true
      );
    }
    actions.configuration.configure_all_projects();

    // Also
    projects_store.on(
      "change",
      actions.handle_projects_store_update.bind(actions)
    );
    actions.handle_projects_store_update(projects_store);
  });

  return syncdb;
}
