/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Actions involving configuration of the course.
*/

// cSpell:ignore collabs

import { redux } from "@cocalc/frontend/app-framework";
import {
  derive_project_img_name,
  SoftwareEnvironmentState,
} from "@cocalc/frontend/custom-software/selector";
import { Datastore, EnvVars } from "@cocalc/frontend/projects/actions";
import { store as projects_store } from "@cocalc/frontend/projects/store";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { CourseActions, primary_key } from "../actions";
import {
  CourseSettingsRecord,
  PARALLEL_DEFAULT,
} from "../store";
import { SyncDBRecord } from "../types";
import {
  StudentProjectFunctionality,
  completeStudentProjectFunctionality,
} from "./customize-student-project-functionality";
import type { PurchaseInfo } from "@cocalc/util/purchases/quota/types";
import { delay } from "awaiting";
import {
  NBGRADER_CELL_TIMEOUT_MS,
  NBGRADER_MAX_OUTPUT,
  NBGRADER_MAX_OUTPUT_PER_CELL,
  NBGRADER_TIMEOUT_MS,
} from "../assignments/consts";

interface ConfigurationTarget {
  project_id: string;
  path: string;
}

export class ConfigurationActions {
  private course_actions: CourseActions;
  private configuring: boolean = false;
  private configureAgain: boolean = false;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
    this.push_missing_handouts_and_assignments = reuseInFlight(
      this.push_missing_handouts_and_assignments.bind(this),
    );
  }

  set = (obj: SyncDBRecord, commit: boolean = true): void => {
    this.course_actions.set(obj, commit);
  };

  set_title = (title: string): void => {
    this.set({ title, table: "settings" });
    this.course_actions.student_projects.set_all_student_project_titles(title);
    this.course_actions.shared_project.set_project_title();
  };

  set_description = (description: string): void => {
    this.set({ description, table: "settings" });
    this.course_actions.student_projects.set_all_student_project_descriptions(
      description,
    );
    this.course_actions.shared_project.set_project_description();
  };


  set_pay_choice = (type: "student" | "institute", value: boolean): void => {
    this.set({ [type + "_pay"]: value, table: "settings" });
    if (type == "student") {
      if (!value) {
        this.setStudentPay({ when: "" });
      }
    }
  };

  set_allow_collabs = (allow_collabs: boolean): void => {
    this.set({ allow_collabs, table: "settings" });
    this.course_actions.student_projects.configure_all_projects();
  };

  set_student_project_functionality = async (
    student_project_functionality: StudentProjectFunctionality,
  ): Promise<void> => {
    this.set({ student_project_functionality, table: "settings" });
    await this.course_actions.student_projects.configure_all_projects();
  };

  set_email_invite = (body: string): void => {
    this.set({ email_invite: body, table: "settings" });
  };

  // Set the pay option for the course, and ensure that the course fields are
  // set on every student project in the course (see schema.coffee for format
  // of the course field) to reflect this change in the database.
  setStudentPay = async ({
    when,
    info,
    cost,
  }: {
    when?: Date | string; // date when they need to pay
    info?: PurchaseInfo; // what they must buy for the course
    cost?: number;
  }) => {
    const value = {
      ...(info != null ? { payInfo: info } : undefined),
      ...(when != null
        ? { pay: typeof when != "string" ? when.toISOString() : when }
        : undefined),
      ...(cost != null ? { payCost: cost } : undefined),
    };
    const store = this.course_actions.get_store();
    // wait until store changes with new settings, then configure student projects
    store.once("change", async () => {
      await this.course_actions.student_projects.set_all_student_project_course_info();
    });
    await this.set({
      table: "settings",
      ...value,
    });
  };

  configure_all_projects = async (force: boolean = false): Promise<void> => {
    if (this.configuring) {
      // Important -- if configure_all_projects is called *while* it is running,
      // wait until it is done, then call it again (though I'm being lazy about the
      // await!).  Don't do the actual work more than once
      // at the same time since that might confuse the db writes, but
      // also don't just reuse in flight, which will miss the later calls.
      this.configureAgain = true;
      return;
    }
    try {
      this.configureAgain = false;
      this.configuring = true;
      await this.course_actions.shared_project.configure();
      await this.course_actions.student_projects.configure_all_projects(force);
      await this.configure_nbgrader_grade_project();
    } finally {
      this.configuring = false;
      if (this.configureAgain) {
        this.configureAgain = false;
        this.configure_all_projects();
      }
    }
  };

  push_missing_handouts_and_assignments = async (): Promise<void> => {
    const store = this.course_actions.get_store();
    for (const student_id of store.get_student_ids({ deleted: false })) {
      await this.course_actions.students.push_missing_handouts_and_assignments(
        student_id,
      );
    }
  };

  set_copy_parallel = (copy_parallel: number = PARALLEL_DEFAULT): void => {
    this.set({
      copy_parallel,
      table: "settings",
    });
  };

  configure_nbgrader_grade_project = async (
    project_id?: string,
  ): Promise<void> => {
    let store;
    try {
      store = this.course_actions.get_store();
    } catch (_) {
      // this could get called during grading that is ongoing right when
      // the user decides to close the document, and in that case get_store()
      // would throw an error: https://github.com/sagemathinc/cocalc/issues/7050
      return;
    }

    if (project_id == null) {
      project_id = store.getIn(["settings", "nbgrader_grade_project"]);
    }
    if (project_id == null || project_id == "") return;

    const id = this.course_actions.set_activity({
      desc: "Configuring grading project.",
    });

    try {
      // make sure the course config for that nbgrader project (mainly for the datastore!) is set
      const datastore: Datastore = store.get_datastore();
      const envvars: EnvVars = store.get_envvars();
      const projects_actions = redux.getActions("projects");

      // if for some reason this is a student project, we don't want to reconfigure it
      const course_info: any = projects_store
        .get_course_info(project_id)
        ?.toJS();
      if (course_info?.type == null || course_info.type == "nbgrader") {
        await projects_actions.set_project_course_info({
          project_id,
          course_project_id: store.get("course_project_id"),
          path: store.get("course_filename"),
          pay: "", // pay
          payInfo: null,
          account_id: null,
          email_address: null,
          datastore,
          type: "nbgrader",
          envvars,
        });
      }

      // we also make sure all teachers have access to that project – otherwise nbgrader can't work, etc.
      // this has to happen *after* setting the course field, extended access control, ...
      const ps = redux.getStore("projects");
      const teachers = ps.get_users(store.get("course_project_id"));
      const users_of_grade_project = ps.get_users(project_id);
      if (users_of_grade_project != null && teachers != null) {
        for (const account_id of teachers.keys()) {
          const user = users_of_grade_project.get(account_id);
          if (user != null) continue;
          await webapp_client.project_collaborators.add_collaborator({
            account_id,
            project_id,
          });
        }
      }
    } catch (err) {
      this.course_actions.set_error(
        `Error configuring grading project - ${err}`,
      );
    } finally {
      this.course_actions.set_activity({ id });
    }
  };

  // project_id is a uuid *or* empty string.
  set_nbgrader_grade_project = async (
    project_id: string = "",
  ): Promise<void> => {
    this.set({
      nbgrader_grade_project: project_id,
      table: "settings",
    });

    // not empty string → configure that grading project
    if (project_id) {
      await this.configure_nbgrader_grade_project(project_id);
    }
  };

  set_nbgrader_cell_timeout_ms = (
    nbgrader_cell_timeout_ms: number = NBGRADER_CELL_TIMEOUT_MS,
  ): void => {
    this.set({
      nbgrader_cell_timeout_ms,
      table: "settings",
    });
  };

  set_nbgrader_timeout_ms = (
    nbgrader_timeout_ms: number = NBGRADER_TIMEOUT_MS,
  ): void => {
    this.set({
      nbgrader_timeout_ms,
      table: "settings",
    });
  };

  set_nbgrader_max_output = (
    nbgrader_max_output: number = NBGRADER_MAX_OUTPUT,
  ): void => {
    this.set({
      nbgrader_max_output,
      table: "settings",
    });
  };

  set_nbgrader_max_output_per_cell = (
    nbgrader_max_output_per_cell: number = NBGRADER_MAX_OUTPUT_PER_CELL,
  ): void => {
    this.set({
      nbgrader_max_output_per_cell,
      table: "settings",
    });
  };

  set_nbgrader_include_hidden_tests = (value: boolean): void => {
    this.set({
      nbgrader_include_hidden_tests: value,
      table: "settings",
    });
  };

  set_inherit_compute_image = (image?: string): void => {
    this.set({ inherit_compute_image: image != null, table: "settings" });
    if (image != null) {
      this.set_compute_image(image);
    }
  };

  set_compute_image = (image: string) => {
    this.set({
      custom_image: image,
      table: "settings",
    });
    this.course_actions.student_projects.configure_all_projects();
    this.course_actions.shared_project.set_project_compute_image();
  };

  set_software_environment = async (
    state: SoftwareEnvironmentState,
  ): Promise<void> => {
    const image = await derive_project_img_name(state);
    this.set_compute_image(image);
  };

  set_nbgrader_parallel = (
    nbgrader_parallel: number = PARALLEL_DEFAULT,
  ): void => {
    this.set({
      nbgrader_parallel,
      table: "settings",
    });
  };

  set_datastore = (datastore: Datastore): void => {
    this.set({ datastore, table: "settings" });
    setTimeout(() => {
      this.configure_all_projects_shared_and_nbgrader();
    }, 1);
  };

  set_envvars = (inherit: boolean): void => {
    this.set({ envvars: { inherit }, table: "settings" });
    setTimeout(() => {
      this.configure_all_projects_shared_and_nbgrader();
    }, 1);
  };

  private configure_all_projects_shared_and_nbgrader = () => {
    this.course_actions.student_projects.configure_all_projects();
    this.course_actions.shared_project.set_datastore_and_envvars();
    // in case there is a separate nbgrader project, we have to set the envvars as well
    this.configure_nbgrader_grade_project();
  };

  purgeDeleted = (): void => {
    const { syncdb } = this.course_actions;
    for (const record of syncdb.get()) {
      if (record?.get("deleted")) {
        for (const table in primary_key) {
          const key = primary_key[table];
          if (record.get(key)) {
            syncdb.delete({ [key]: record.get(key) });
            break;
          }
        }
      }
    }
    syncdb.commit();
  };

  copyConfiguration = async ({
    groups,
    targets,
  }: {
    groups: ConfigurationGroup[];
    targets: ConfigurationTarget[];
  }) => {
    const store = this.course_actions.get_store();
    if (groups.length == 0 || targets.length == 0 || store == null) {
      return;
    }
    const settings = store.get("settings");
    for (const target of targets) {
      const targetActions = await openCourseFileAndGetActions({
        ...target,
        maxTimeMs: 30000,
      });
      for (const group of groups) {
        await configureGroup({
          group,
          settings,
          actions: targetActions.course_actions,
        });
      }
    }
    // switch back
    const { project_id, path } = this.course_actions.syncdb;
    redux.getProjectActions(project_id).open_file({ path, foreground: true });
  };
}

async function openCourseFileAndGetActions({ project_id, path, maxTimeMs }) {
  await redux
    .getProjectActions(project_id)
    .open_file({ path, foreground: true });
  const t = Date.now();
  let d = 250;
  while (Date.now() + d - t <= maxTimeMs) {
    await delay(d);
    const targetActions = redux.getEditorActions(project_id, path);
    if (targetActions?.course_actions?.syncdb.get_state() == "ready") {
      return targetActions;
    }
    d *= 1.1;
  }
  throw Error(`unable to open '${path}'`);
}

export const CONFIGURATION_GROUPS = [
  "collaborator-policy",
  "email-invitation",
  "copy-limit",
  "restrict-student-projects",
  "nbgrader",
  "upgrades",
  //   "network-file-systems",
  //   "env-variables",
  //   "software-environment",
] as const;

export type ConfigurationGroup = (typeof CONFIGURATION_GROUPS)[number];

async function configureGroup({
  group,
  settings,
  actions,
}: {
  group: ConfigurationGroup;
  settings: CourseSettingsRecord;
  actions: CourseActions;
}) {
  switch (group) {
    case "collaborator-policy":
      const allow_collabs = !!settings.get("allow_collabs");
      actions.configuration.set_allow_collabs(allow_collabs);
      return;
    case "email-invitation":
      actions.configuration.set_email_invite(settings.get("email_invite"));
      return;
    case "copy-limit":
      actions.configuration.set_copy_parallel(settings.get("copy_parallel"));
      return;
    case "restrict-student-projects":
      actions.configuration.set_student_project_functionality(
        completeStudentProjectFunctionality(
          settings.get("student_project_functionality")?.toJS() ?? {},
        ),
      );
      return;
    case "nbgrader":
      await actions.configuration.set_nbgrader_grade_project(
        settings.get("nbgrader_grade_project"),
      );
      await actions.configuration.set_nbgrader_cell_timeout_ms(
        settings.get("nbgrader_cell_timeout_ms"),
      );
      await actions.configuration.set_nbgrader_timeout_ms(
        settings.get("nbgrader_timeout_ms"),
      );
      await actions.configuration.set_nbgrader_max_output(
        settings.get("nbgrader_max_output"),
      );
      await actions.configuration.set_nbgrader_max_output_per_cell(
        settings.get("nbgrader_max_output_per_cell"),
      );
      await actions.configuration.set_nbgrader_include_hidden_tests(
        !!settings.get("nbgrader_include_hidden_tests"),
      );
      return;

    case "upgrades":
      if (settings.get("student_pay")) {
        actions.configuration.set_pay_choice("student", true);
        await actions.configuration.setStudentPay({
          when: settings.get("pay"),
          info: settings.get("payInfo")?.toJS(),
          cost: settings.get("payCost"),
        });
        await actions.configuration.configure_all_projects();
      } else {
        actions.configuration.set_pay_choice("student", false);
      }
      if (settings.get("institute_pay")) {
        actions.configuration.set_pay_choice("institute", true);
      } else {
        actions.configuration.set_pay_choice("institute", false);
      }
      return;

    //     case "network-file-systems":
    //     case "env-variables":
    //     case "software-environment":
    default:
      throw Error(`configuring group ${group} not implemented`);
  }
}
