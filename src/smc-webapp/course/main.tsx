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
Course Management
*/

// standard non-CoCalc libraries
import { Map, Set } from "immutable";

// CoCalc libraries
const misc = require("smc-util/misc");

// React libraries
import {
  React,
  rclass,
  rtypes,
  Component,
  AppRedux,
  redux
} from "../app-framework";

import { Button, ButtonGroup, Tabs, Tab } from "react-bootstrap";

let {
  ActivityDisplay,
  ErrorDisplay,
  Icon,
  Loading,
  SaveButton,
  VisibleMDLG
} = require("../r_misc");

// Course components
import {
  CourseStore,
  StudentsMap,
  AssignmentsMap,
  HandoutsMap,
  CourseSettingsRecord
} from "./store";
import { CourseActions } from "./actions";
import * as CourseSync from "./sync";
import { CSSProperties } from "react";

import { StudentsPanel, StudentsPanelHeader } from "./students_panel";
import { AssignmentsPanel, AssignmentsPanelHeader } from "./assignments_panel";
import { HandoutsPanel, HandoutsPanelHeader } from "./handouts_panel";
import { ConfigurationPanel, ConfigurationPanelHeader } from "./configuration_panel";
import { PayBanner } from "./pay-banner";
import { SharedProjectPanel, SharedProjectPanelHeader } from "./shared_project_panel";
import { UserMap, ProjectMap } from "../todo-types";

const redux_name = (project_id, course_filename) =>
  `editor-${project_id}-${course_filename}`;

const syncdbs = {};
const init_redux = function(course_filename, redux, course_project_id) {
  const the_redux_name = redux_name(course_project_id, course_filename);
  const get_actions = () => redux.getActions(the_redux_name);
  if (get_actions() != null) {
    // already initalized
    return;
  }

  const initial_store_state = {
    course_filename,
    course_project_id,
    expanded_students: Set(), // Set of student id's (string) which should be expanded on render
    expanded_assignments: Set(), // Set of assignment id's (string) which should be expanded on render
    expanded_handouts: Set(), // Set of handout id's (string) which should be expanded on render
    expanded_peer_configs: Set(), // Set of assignment configs (key = assignment_id) which should be expanded on render
    active_student_sort: { column_name: "last_name", is_descending: false },
    active_assignment_sort: { column_name: "due_date", is_descending: false },
    settings: { allow_collabs: true }
  };

  const store = redux.createStore(
    the_redux_name,
    CourseStore,
    initial_store_state
  );
  const actions = redux.createActions(the_redux_name, CourseActions);
  actions.syncdb = syncdbs[the_redux_name] = CourseSync.create_sync_db(
    redux,
    actions,
    store,
    course_filename
  );

  return the_redux_name;
};

const remove_redux = function(course_filename, redux, course_project_id) {
  const the_redux_name = redux_name(course_project_id, course_filename);

  // Remove the listener for changes in the collaborators on this project.
  const actions = redux.getActions(the_redux_name);
  if (actions == null) {
    // already cleaned up and removed.
    return;
  }
  redux
    .getStore("projects")
    .removeListener("change", actions.handle_projects_store_update);

  // Remove the store and actions.
  redux.removeStore(the_redux_name);
  redux.removeActions(the_redux_name);
  if (syncdbs[the_redux_name] != null) {
    syncdbs[the_redux_name].close();
  }
  delete syncdbs[the_redux_name];
  return the_redux_name;
};

const COURSE_EDITOR_STYLE: CSSProperties = {
  height: "100%",
  overflowY: "scroll",
  padding: "7px"
};

interface CourseReactProps {
  redux: AppRedux;
  name: string;
  project_id: string;
  path: string;
  saving?: boolean;
  show_save_button?: boolean;
}

interface CourseReduxProps {
  error: string;
  tab: string;
  activity: Map<any, any>; // status messages about current activity happening (e.g., things being assigned)
  students: StudentsMap;
  assignments: AssignmentsMap;
  handouts: HandoutsMap
  settings: CourseSettingsRecord
  unsaved: boolean;

  user_map: UserMap

  project_map: ProjectMap
}

export const CourseEditor = rclass<CourseReactProps>(
  class CourseEditor extends Component<CourseReactProps & CourseReduxProps> {
    displayName: "CourseEditor-Main";

    static reduxProps = ({ name }) => {
      return {
        [name]: {
          error: rtypes.string,
          tab: rtypes.string,
          activity: rtypes.immutable.Map, // status messages about current activity happening (e.g., things being assigned)
          students: rtypes.immutable.Map,
          assignments: rtypes.immutable.Map,
          handouts: rtypes.immutable.Map,
          settings: rtypes.immutable.Map,
          unsaved: rtypes.bool
        },
        users: {
          user_map: rtypes.immutable
        },
        projects: {
          project_map: rtypes.immutable
        }
      };
    }; // gets updated when student is active on their project

    shouldComponentUpdate(props) {
      return misc.is_different(this.props, props, [
        "error",
        "tab",
        "activity",
        "students",
        "assignments",
        "handouts",
        "settings",
        "unsaved",
        "user_map",
        "project_map"
      ]);
    }

    actions(): CourseActions {
      return redux.getActions(this.props.name);
    }

    render_activity() {
      return (
        <ActivityDisplay
          activity={misc.values(
            this.props.activity != null ? this.props.activity.toJS() : undefined
          )}
          trunc={80}
          on_clear={() => this.actions().clear_activity()}
        />
      );
    }

    render_error() {
      return (
        <ErrorDisplay
          error={this.props.error}
          onClose={() => this.actions().set_error("")}
        />
      );
    }

    render_pay_banner() {
      return (
        <PayBanner
          settings={this.props.settings}
          num_students={
            this.props.students != null ? this.props.students.size : 0
          }
          tab={this.props.tab}
          name={this.props.name}
        />
      );
    }

    render_save_button() {
      return (
        <SaveButton
          saving={this.props.saving}
          unsaved={true}
          on_click={() => this.actions().save()}
        />
      );
    }

    show_files() {
      return this.props.redux != null
        ? this.props.redux
            .getProjectActions(this.props.project_id)
            .set_active_tab("files")
        : undefined;
    }

    render_files_button() {
      return (
        <Button
          className="smc-small-only"
          style={{ float: "right", marginLeft: "15px" }}
          onClick={this.show_files}
        >
          <Icon name="toggle-up" /> Files
        </Button>
      );
    }

    show_timetravel() {
      return this.props.redux != null
        ? this.props.redux.getProjectActions(this.props.project_id).open_file({
            path: misc.history_path(this.props.path),
            foreground: true,
            foreground_project: true
          })
        : undefined;
    }

    save_to_disk() {
      return this.props.redux != null ? this.actions().save() : undefined;
    }

    render_save_timetravel() {
      return (
        <div style={{ float: "right", marginRight: "15px" }}>
          <ButtonGroup>
            <Button
              onClick={this.save_to_disk}
              bsStyle="success"
              disabled={!this.props.unsaved}
            >
              <Icon name="save" /> <VisibleMDLG>Save</VisibleMDLG>
            </Button>
            <Button onClick={this.show_timetravel} bsStyle="info">
              <Icon name="history" /> <VisibleMDLG>TimeTravel</VisibleMDLG>
            </Button>
          </ButtonGroup>
        </div>
      );
    }

    num_students() {
      return __guard__(this.props.redux.getStore(this.props.name), x =>
        x.num_students()
      );
    }

    num_assignments() {
      return __guard__(this.props.redux.getStore(this.props.name), x =>
        x.num_assignments()
      );
    }

    num_handouts() {
      return __guard__(this.props.redux.getStore(this.props.name), x =>
        x.num_handouts()
      );
    }

    render_students() {
      if (
        this.props.redux != null &&
        this.props.students != null &&
        this.props.user_map != null &&
        this.props.project_map != null
      ) {
        return (
          <StudentsPanel
            redux={this.props.redux}
            students={this.props.students}
            name={this.props.name}
            project_id={this.props.project_id}
            user_map={this.props.user_map}
            project_map={this.props.project_map}
            assignments={this.props.assignments}
          />
        );
      } else {
        return <Loading />;
      }
    }

    render_assignments() {
      if (
        this.props.redux != null &&
        this.props.assignments != null &&
        this.props.user_map != null &&
        this.props.students != null
      ) {
        return (
          <AssignmentsPanel
            actions={this.props.redux.getActions(this.props.name)}
            redux={this.props.redux}
            all_assignments={this.props.assignments}
            name={this.props.name}
            project_id={this.props.project_id}
            user_map={this.props.user_map}
            students={this.props.students}
          />
        );
      } else {
        return <Loading />;
      }
    }

    render_handouts() {
      if (
        this.props.redux != null &&
        this.props.assignments != null &&
        this.props.user_map != null &&
        this.props.students != null
      ) {
        return (
          <HandoutsPanel
            actions={this.props.redux.getActions(this.props.name)}
            all_handouts={this.props.handouts}
            project_id={this.props.project_id}
            user_map={this.props.user_map}
            students={this.props.students}
            store_object={this.props.redux.getStore(this.props.name)}
            project_actions={this.props.redux.getProjectActions(
              this.props.project_id
            )}
            name={this.props.name}
          />
        );
      } else {
        return <Loading />;
      }
    }

    render_configuration() {
      if (this.props.redux != null && this.props.settings != null) {
        return (
          <ConfigurationPanel
            redux={this.props.redux}
            settings={this.props.settings}
            name={this.props.name}
            project_id={this.props.project_id}
            path={this.props.path}
            shared_project_id={
              this.props.settings != null
                ? this.props.settings.get("shared_project_id")
                : undefined
            }
            project_map={this.props.project_map}
          />
        );
      } else {
        return <Loading />;
      }
    }

    render_shared_project() {
      if (this.props.redux != null && this.props.settings != null) {
        return (
          <SharedProjectPanel
            redux={this.props.redux}
            name={this.props.name}
            shared_project_id={
              this.props.settings != null
                ? this.props.settings.get("shared_project_id")
                : undefined
            }
          />
        );
      } else {
        return <Loading />;
      }
    }

    render_tabs() {
      return (
        <Tabs
          id={"course-tabs"}
          animation={false}
          activeKey={this.props.tab}
          onSelect={key => this.actions().set_tab(key)}
        >
          <Tab
            eventKey={"students"}
            title={<StudentsPanelHeader n={this.num_students()} />}
          >
            {this.render_students()}
          </Tab>
          <Tab
            eventKey={"assignments"}
            title={<AssignmentsPanelHeader n={this.num_assignments()} />}
          >
            {this.render_assignments()}
          </Tab>
          <Tab
            eventKey={"handouts"}
            title={<HandoutsPanelHeader n={this.num_handouts()} />}
          >
            {this.render_handouts()}
          </Tab>
          <Tab eventKey={"configuration"} title={<ConfigurationPanelHeader />}>
            <div style={{ marginTop: "1em" }} />
            {this.render_configuration()}
          </Tab>
          <Tab
            eventKey={"shared_project"}
            title={
              <SharedProjectPanelHeader
                project_exists={
                  !!(this.props.settings != null
                    ? this.props.settings.get("shared_project_id")
                    : undefined)
                }
              />
            }
          >
            <div style={{ marginTop: "1em" }} />
            {this.render_shared_project()}
          </Tab>
        </Tabs>
      );
    }

    render() {
      return (
        <div style={COURSE_EDITOR_STYLE}>
          {this.render_pay_banner()}
          {this.props.show_save_button ? this.render_save_button() : undefined}
          {this.props.error ? this.render_error() : undefined}
          {this.props.activity != null ? this.render_activity() : undefined}
          {this.render_files_button()}
          {this.render_save_timetravel()}
          {this.render_tabs()}
        </div>
      );
    }
  }
);

require("project_file").register_file_editor({
  ext: "course",
  icon: "graduation-cap",
  init: init_redux,
  component: CourseEditor,
  remove: remove_redux
});

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
