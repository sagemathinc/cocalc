//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2019, Sagemath Inc.
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

// standard non-CoCalc libraries
import { Map, Set } from "immutable";

import { AppRedux } from "../app-framework";
import { CourseActions } from "./actions";
import { create_sync_db } from "./sync";
import { AssignmentRecord, CourseStore } from "./store";

import { SyncDB } from "smc-util/sync/editor/db/sync";

const syncdbs: { [name: string]: SyncDB } = {};

function redux_name(project_id: string, course_filename: string): string {
  return `editor-${project_id}-${course_filename}`;
}
export function init_redux(
  course_filename: string,
  redux: AppRedux,
  course_project_id: string,
  the_redux_name?: string
): string {
  if (the_redux_name == null) {
    the_redux_name = redux_name(course_project_id, course_filename);
  }
  if (redux.getActions(the_redux_name) != null) {
    // already initalized
    return the_redux_name;
  }

  // DO NOT initialize settings here. They are initialized in sync.ts to prevent a
  // race condition involving automatic course configuration and settings
  const initial_store_state: any = {
    activity: Map<number, string>(),
    assignments: Map<string, AssignmentRecord>(),
    configure_projects: "",
    error: undefined,
    active_feedback_edits: Map(),
    handouts: Map(),
    saving: false,
    show_save_button: false,
    students: Map(),
    tab: "students",
    unsaved: false,
    course_filename,
    course_project_id,
    expanded_students: Set(), // Set of student id's (string) which should be expanded on render
    expanded_assignments: Set(), // Set of assignment id's (string) which should be expanded on render
    expanded_handouts: Set(), // Set of handout id's (string) which should be expanded on render
    expanded_peer_configs: Set(), // Set of assignment configs (key = assignment_id) which should be expanded on render
    expanded_skip_gradings: Set(),
    active_student_sort: { column_name: "last_name", is_descending: false },
    active_assignment_sort: { column_name: "due_date", is_descending: false },
    action_all_projects_state: "any"
  };

  const store: CourseStore = redux.createStore(
    the_redux_name,
    CourseStore as any,
    initial_store_state
  ) as CourseStore;

  const actions: CourseActions = redux.createActions(
    the_redux_name,
    CourseActions
  );
  actions.syncdb = syncdbs[the_redux_name] = create_sync_db(
    redux,
    actions,
    store,
    course_filename
  );

  return the_redux_name;
}

export function remove_redux(
  course_filename: string,
  redux: AppRedux,
  course_project_id: string,
  the_redux_name?: string
) {
  if (the_redux_name == null) {
    the_redux_name = redux_name(course_project_id, course_filename);
  }

  // Remove the listener for changes in the collaborators on this project.
  const actions: CourseActions = redux.getActions(the_redux_name);
  if (actions == null) {
    // already cleaned up and removed.
    return;
  }
  redux
    .getStore("projects")
    .removeListener(
      "change",
      actions.handle_projects_store_update.bind(actions)
    );

  // Remove the store and actions.
  redux.removeStore(the_redux_name);
  redux.removeActions(the_redux_name);
  if (syncdbs[the_redux_name] != null) {
    syncdbs[the_redux_name].close();
  }
  delete syncdbs[the_redux_name];
  return the_redux_name;
}
