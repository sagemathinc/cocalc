/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Actions specific to manipulating the student projects that students have in a course.
*/

import { delay } from "awaiting";
import { CourseActions } from "../actions";
import { CourseStore } from "../store";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";
import { len, keys, copy, days_ago } from "@cocalc/util/misc";
import { SITE_NAME } from "@cocalc/util/theme";
import { markdown_to_html } from "@cocalc/frontend/markdown";
import { UpgradeGoal } from "../types";
import { run_in_all_projects, Result } from "./run-in-all-projects";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/compute-images";
import { Datastore, EnvVars } from "@cocalc/frontend/projects/actions";
import { RESEND_INVITE_INTERVAL_DAYS } from "@cocalc/util/consts/invites";

export const RESEND_INVITE_BEFORE = days_ago(RESEND_INVITE_INTERVAL_DAYS);
export class StudentProjectsActions {
  private course_actions: CourseActions;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
  }

  private get_store(): CourseStore {
    const store = this.course_actions.get_store();
    if (store == null) throw Error("no store");
    return store;
  }

  // Create and configure a single student project.
  public async create_student_project(
    student_id: string
  ): Promise<string | undefined> {
    const { store, student } = this.course_actions.resolve({
      student_id,
      finish: this.course_actions.set_error.bind(this),
    });
    if (store == null || student == null) return;
    if (store.get("students") == null || store.get("settings") == null) {
      this.course_actions.set_error(
        "BUG: attempt to create when stores not yet initialized"
      );
      return;
    }
    if (student.get("project_id")) {
      // project already created.
      return student.get("project_id");
    }
    this.course_actions.set({
      create_project: webapp_client.server_time(),
      table: "students",
      student_id,
    });
    const id = this.course_actions.set_activity({
      desc: `Create project for ${store.get_student_name(student_id)}.`,
    });
    let project_id: string;
    try {
      project_id = await redux.getActions("projects").create_project({
        title: store.get("settings").get("title"),
        description: store.get("settings").get("description"),
        image:
          store.get("settings").get("custom_image") ?? DEFAULT_COMPUTE_IMAGE,
      });
    } catch (err) {
      this.course_actions.set_error(
        `error creating student project for ${store.get_student_name(
          student_id
        )} -- ${err}`
      );
      return;
    } finally {
      this.course_actions.clear_activity(id);
    }
    this.course_actions.set({
      create_project: null,
      project_id,
      table: "students",
      student_id,
    });
    await this.configure_project({
      student_id,
      student_project_id: project_id,
    });
    return project_id;
  }

  // if student is an email address, invite via email – otherwise, if account_id, invite via standard collaborator invite
  public async invite_student_to_project(props: {
    student_id: string;
    student: string; // could be account_id or email_address
    student_project_id?: string;
  }) {
    const { student_id, student, student_project_id } = props;
    if (student_project_id == null) return;

    // console.log("invite", x, " to ", student_project_id);
    if (student.includes("@")) {
      const store = this.get_store();
      if (store == null) return;
      const account_store = redux.getStore("account");
      const name = account_store.get_fullname();
      const replyto = account_store.get_email_address();
      const title = store.get("settings").get("title");
      const site_name =
        redux.getStore("customize").get("site_name") ?? SITE_NAME;
      const subject = `${site_name} Invitation to Course ${title}`;
      let body = store.get_email_invite();
      body = body.replace(/{title}/g, title).replace(/{name}/g, name);
      body = markdown_to_html(body);
      await redux
        .getActions("projects")
        .invite_collaborators_by_email(
          student_project_id,
          student,
          body,
          subject,
          true,
          replyto,
          name
        );
      this.course_actions.set({
        table: "students",
        student_id,
        last_email_invite: Date.now(),
      });
    } else {
      await redux
        .getActions("projects")
        .invite_collaborator(student_project_id, student);
    }
  }

  private async configure_project_users(props: {
    student_project_id: string;
    student_id: string;
    force_send_invite_by_email?: boolean;
  }): Promise<void> {
    const {
      student_project_id,
      student_id,
      force_send_invite_by_email = false,
    } = props;
    //console.log("configure_project_users", student_project_id, student_id)
    // Add student and all collaborators on this project to the project with given project_id.
    // users = who is currently a user of the student's project?
    const users = redux.getStore("projects").get_users(student_project_id); // immutable.js map
    if (users == null) return; // can't do anything if this isn't known...

    const s = this.get_store();
    if (s == null) return;
    const student = s.get_student(student_id);
    if (student == null) return; // no such student..

    // Make sure the student is on the student's project:
    const student_account_id = student.get("account_id");
    if (student_account_id == null) {
      // No known account yet, so invite by email.  That said,
      // we only do this at most once every few days.
      const last_email_invite = student.get("last_email_invite");
      if (force_send_invite_by_email || !last_email_invite) {
        await this.invite_student_to_project({
          student_id,
          student: student.get("email_address"),
          student_project_id,
        });
        this.course_actions.set({
          table: "students",
          student_id,
          last_email_invite: Date.now(),
        });
      }
    } else if (
      (users != null ? users.get(student_account_id) : undefined) == null
    ) {
      // users might not be set yet if project *just* created
      await this.invite_student_to_project({
        student_id,
        student: student_account_id,
        student_project_id,
      });
    }

    // Make sure all collaborators on course project are on the student's project:
    const course_collaborators = redux
      .getStore("projects")
      .get_users(s.get("course_project_id"));
    if (course_collaborators == null) {
      // console.log("projects store isn't sufficiently initialized yet...");
      return;
    }
    for (const account_id of course_collaborators.keys()) {
      if (!users.has(account_id)) {
        await redux
          .getActions("projects")
          .invite_collaborator(student_project_id, account_id);
      }
    }

    // Regarding student_account_id !== undefined below, see https://github.com/sagemathinc/cocalc/pull/3259
    // The problem is that student_account_id might not yet be known to the .course, even though
    // the student has been added and the account_id exists, and is known to the account opening
    // the .course file.  This is just due to a race condition somewhere else.  For now -- before
    // just factoring out and rewriting all this code better -- we at least make this one change
    // so the student isn't "brutally" kicked out of the course.
    if (
      s.get("settings") != undefined &&
      !s.get_allow_collabs() &&
      student_account_id != undefined
    ) {
      // Remove anybody extra on the student project
      for (const account_id of users.keys()) {
        if (
          !course_collaborators.has(account_id) &&
          account_id !== student_account_id
        ) {
          await redux
            .getActions("projects")
            .remove_collaborator(student_project_id, account_id);
        }
      }
    }
  }

  // Sets the licenses for the given project to the given licenses
  // from our course configuration.  Any licenses already on the
  // project that are not set at all in our course configure license
  // list stay unchanged.  This way a student can buy their own extra
  // license and apply it and it stays even when the instructor makes
  // changes to licenses.
  private async set_project_site_license(
    project_id: string,
    license_ids: string[]
  ): Promise<void> {
    const project_map = redux.getStore("projects").get("project_map");
    if (project_map == null || project_map.get(project_id) == null) {
      // do nothing if we're not a collab on the project or info about
      // it isn't loaded -- this should have been ensured earlier on.
      return;
    }
    const store = this.get_store();
    if (store == null) return;
    const currentLicenses: string[] = keys(
      project_map.getIn([project_id, "site_license"])?.toJS() ?? {}
    );
    const courseLicenses = new Set(
      (store.getIn(["settings", "site_license_id"]) ?? "").split(",")
    );
    const removedLicenses = new Set(
      (store.getIn(["settings", "site_license_removed"]) ?? "").split(",")
    );
    const toApply = [...license_ids];
    for (const id of currentLicenses) {
      if (!courseLicenses.has(id) && !removedLicenses.has(id)) {
        toApply.push(id);
      }
    }
    const actions = redux.getActions("projects");
    await actions.set_site_license(project_id, toApply.join(","));
  }

  private async configure_project_license(
    student_project_id: string,
    license_id?: string
  ): Promise<void> {
    if (license_id != null) {
      await this.set_project_site_license(
        student_project_id,
        license_id.split(",")
      );
      return;
    }
    const store = this.get_store();
    if (store == null) return;
    // Set all license keys we have that are known and not
    // expired.  (option = false so cached)
    const licenses = await store.getLicenses(false);
    const license_ids: string[] = [];
    for (const license_id in licenses) {
      if (!licenses[license_id].expired) {
        license_ids.push(license_id);
      }
    }
    await this.set_project_site_license(student_project_id, license_ids);
  }

  private async remove_project_license(
    student_project_id: string
  ): Promise<void> {
    const actions = redux.getActions("projects");
    await actions.set_site_license(student_project_id, "");
  }

  public async remove_all_project_licenses(): Promise<void> {
    const id = this.course_actions.set_activity({
      desc: "Removing all student project licenses...",
    });
    try {
      const store = this.get_store();
      if (store == null) return;
      for (const student of store.get_students().valueSeq().toArray()) {
        const student_project_id = student.get("project_id");
        if (student_project_id == null) continue;
        await this.remove_project_license(student_project_id);
      }
    } finally {
      this.course_actions.set_activity({ id });
    }
  }

  private async configure_project_visibility(
    student_project_id: string
  ): Promise<void> {
    const users_of_student_project = redux
      .getStore("projects")
      .get_users(student_project_id);
    if (users_of_student_project == null) {
      // e.g., not defined in admin view mode
      return;
    }
    // Make project not visible to any collaborator on the course project.
    const store = this.get_store();
    if (store == null) return;
    const users = redux
      .getStore("projects")
      .get_users(store.get("course_project_id"));
    if (users == null) {
      // TODO: should really wait until users is defined, which is a supported thing to do on stores!
      return;
    }
    for (const account_id of users.keys()) {
      const x = users_of_student_project.get(account_id);
      if (x != null && !x.get("hide")) {
        await redux
          .getActions("projects")
          .set_project_hide(account_id, student_project_id, true);
      }
    }
  }

  private async configure_project_title(
    student_project_id: string,
    student_id: string
  ): Promise<void> {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const title = `${store.get_student_name(student_id)} - ${store
      .get("settings")
      .get("title")}`;
    await redux
      .getActions("projects")
      .set_project_title(student_project_id, title);
  }

  // start or stop projects of all (non-deleted) students running
  public action_all_student_projects(action: "start" | "stop"): void {
    if (action == "start") {
      this.course_actions.setState({ action_all_projects_state: "starting" });
    } else if (action === "stop") {
      this.course_actions.setState({ action_all_projects_state: "stopping" });
    }

    this.course_actions.shared_project.action_shared_project(action);

    const store = this.get_store();

    const projects_actions = redux.getActions("projects");
    if (projects_actions == null) {
      throw Error("projects actions must be defined");
    }
    let f = projects_actions[action + "_project"];
    if (f == null) {
      throw Error(`invalid action "${action}"`);
    }
    f = f.bind(projects_actions);
    for (const [, student] of store.get_students()) {
      if (student.get("deleted")) continue;
      const project_id = student.get("project_id");
      if (!project_id) continue;
      f(project_id);
    }
  }

  public cancel_action_all_student_projects(): void {
    this.course_actions.setState({ action_all_projects_state: "any" });
  }

  public async run_in_all_student_projects(
    command: string,
    args?: string[],
    timeout?: number,
    log?: Function
  ): Promise<Result[]> {
    const store = this.get_store();
    // calling start also deals with possibility that
    // it's in stop state.
    this.action_all_student_projects("start");
    return await run_in_all_projects(
      // as string[] is right since map option isn't set (make typescript happy)
      store.get_student_project_ids(),
      command,
      args,
      timeout,
      log
    );
  }

  public async set_all_student_project_titles(title: string): Promise<void> {
    const actions = redux.getActions("projects");
    const store = this.get_store();
    for (const student of store.get_students().valueSeq().toArray()) {
      const student_project_id = student.get("project_id");
      const project_title = `${store.get_student_name(
        student.get("student_id")
      )} - ${title}`;
      if (student_project_id != null) {
        await actions.set_project_title(student_project_id, project_title);
        if (this.course_actions.is_closed()) return;
      }
    }
  }

  private async configure_project_description(
    student_project_id: string
  ): Promise<void> {
    const store = this.get_store();
    await redux
      .getActions("projects")
      .set_project_description(
        student_project_id,
        store.getIn(["settings", "description"])
      );
  }

  public async set_all_student_project_descriptions(
    description: string
  ): Promise<void> {
    const store = this.get_store();
    const actions = redux.getActions("projects");
    for (const student of store.get_students().valueSeq().toArray()) {
      const student_project_id = student.get("project_id");
      if (student_project_id != null) {
        await actions.set_project_description(student_project_id, description);
        if (this.course_actions.is_closed()) return;
      }
    }
  }

  public async set_all_student_project_course_info(
    pay?: string | Date | undefined
  ): Promise<void> {
    const store = this.get_store();
    if (pay == null) {
      // read pay from syncdb then do the configuration below
      pay = store.get_pay();
      if (pay == null) {
        pay = "";
      }
    } else {
      // setting pay in the syncdb, and will then later
      // do some configu below.
      if (pay instanceof Date) {
        pay = pay.toISOString();
      }
      this.course_actions.set({
        pay,
        table: "settings",
      });
    }

    if (pay != "" && !(pay instanceof Date)) {
      // pay *must* be a Date, not just a string timestamp... or "" for not paying.
      pay = new Date(pay);
    }

    const datastore: Datastore = store.get_datastore();
    const envvars: EnvVars = store.get_envvars();
    const student_project_functionality = store
      .getIn(["settings", "student_project_functionality"])
      ?.toJS();

    const actions = redux.getActions("projects");
    const id = this.course_actions.set_activity({
      desc: "Updating project course info...",
    });
    try {
      for (const student of store.get_students().valueSeq().toArray()) {
        const student_project_id = student.get("project_id");
        if (student_project_id == null) continue;
        // account_id: might not be known when student first added, or if student
        // hasn't joined smc yet, so there is no account_id for them.
        const student_account_id = student.get("account_id");
        const student_email_address = student.get("email_address"); // will be known if account_id isn't known.
        await actions.set_project_course_info(
          student_project_id,
          store.get("course_project_id"),
          store.get("course_filename"),
          pay,
          student_account_id,
          student_email_address,
          datastore,
          "student", // type of project
          student_project_functionality,
          envvars
        );
      }
    } finally {
      this.course_actions.set_activity({ id });
    }
  }

  private async configure_project(props: {
    student_id;
    student_project_id?: string;
    force_send_invite_by_email?: boolean;
    license_id?: string; // relevant for serial license strategy only
  }): Promise<void> {
    const { student_id, force_send_invite_by_email, license_id } = props;
    let student_project_id = props.student_project_id;

    // student_project_id is optional. Will be used instead of from student_id store if provided.
    // Configure project for the given student so that it has the right title,
    // description, and collaborators for belonging to the indicated student.
    // - Add student and collaborators on project containing this course to the new project.
    // - Hide project from owner/collabs of the project containing the course.
    // - Set the title to [Student name] + [course title] and description to course description.
    // console.log("configure_project", student_id);
    const store = this.get_store();
    if (student_project_id == null) {
      student_project_id = store.getIn(["students", student_id, "project_id"]);
    }
    // console.log("configure_project", student_id, student_project_id);
    if (student_project_id == null) {
      await this.create_student_project(student_id);
    } else {
      await Promise.all([
        this.configure_project_users({
          student_project_id,
          student_id,
          force_send_invite_by_email,
        }),
        this.configure_project_visibility(student_project_id),
        this.configure_project_title(student_project_id, student_id),
        this.configure_project_description(student_project_id),
        this.configure_project_compute_image(student_project_id),
        this.configure_project_license(student_project_id, license_id),
      ]);
    }
  }

  private async configure_project_compute_image(
    student_project_id: string
  ): Promise<void> {
    const store = this.get_store();
    if (store == null) return;
    const img_id =
      store.get("settings").get("custom_image") ?? DEFAULT_COMPUTE_IMAGE;
    const actions = redux.getProjectActions(student_project_id);
    await actions.set_compute_image(img_id);
  }

  private async delete_student_project(student_id: string): Promise<void> {
    const store = this.get_store();
    const student_project_id = store.getIn([
      "students",
      student_id,
      "project_id",
    ]);
    if (student_project_id == null) return;
    const student_account_id = store.getIn([
      "students",
      student_id,
      "account_id",
    ]);
    if (student_account_id != undefined) {
      redux
        .getActions("projects")
        .remove_collaborator(student_project_id, student_account_id);
    }
    await redux.getActions("projects").delete_project(student_project_id);
    this.course_actions.set({
      create_project: null,
      project_id: null,
      table: "students",
      student_id,
    });
  }

  async reinvite_oustanding_students(): Promise<void> {
    const store = this.get_store();
    if (store == null) return;
    const id = this.course_actions.set_activity({
      desc: "Reinviting students...",
    });
    try {
      this.course_actions.setState({ reinviting_students: true });
      const ids = store.get_student_ids({ deleted: false });
      if (ids == undefined) return;
      let i = 0;

      for (const student_id of ids) {
        if (this.course_actions.is_closed()) return;
        i += 1;
        const student = store.get_student(student_id);
        if (student == null) continue; // weird
        const student_account_id = student.get("account_id");
        if (student_account_id != null) continue; // already has an account – no need to reinvite.

        const id1: number = this.course_actions.set_activity({
          desc: `Progress ${Math.round((100 * i) / ids.length)}%...`,
        });
        const last_email_invite = student.get("last_email_invite");
        if (
          !last_email_invite ||
          new Date(last_email_invite) < RESEND_INVITE_BEFORE
        ) {
          await this.invite_student_to_project({
            student_id,
            student: student.get("email_address"),
            student_project_id: store.get_student_project_id(student_id),
          });
        }
        this.course_actions.set_activity({ id: id1 });
        await delay(0); // give UI, etc. a solid chance to render
      }
    } catch (err) {
      this.course_actions.set_error(`Error reinviting students - ${err}`);
    } finally {
      if (this.course_actions.is_closed()) return;
      this.course_actions.setState({ reinviting_students: false });
      this.course_actions.set_activity({ id });
    }
  }

  async configure_all_projects(force: boolean = false): Promise<void> {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    if (store.get("configuring_projects")) {
      // currently running already.
      return;
    }

    const licenses = await store.getLicenses(force);
    let licenseRunLimits: { [license_id: string]: number } | undefined =
      undefined;

    if (
      store.getIn(["settings", "site_license_strategy"], "serial") ==
        "serial" &&
      len(licenses) > 1
    ) {
      const hasSharedProject = !!store.getIn(["settings", "shared_project_id"]);
      licenseRunLimits = {};
      // get the run limit for each license, but subtract for course project
      // and shared project.
      for (const license_id in licenses) {
        if (licenses[license_id].expired) {
          // license is expired, so consider limit
          // to be 0, since there is no point in trying
          // to use it.
          licenseRunLimits[license_id] = 0;
        } else {
          licenseRunLimits[license_id] =
            licenses[license_id].runLimit - 1 - (hasSharedProject ? 1 : 0);
        }
      }
    }

    let id: number = -1;
    try {
      this.course_actions.setState({ configuring_projects: true });
      id = this.course_actions.set_activity({
        desc: "Ensuring all projects are configured...",
      });
      const ids = store.get_student_ids({ deleted: false });
      if (ids == undefined) {
        return;
      }
      let i = 0;

      // Ensure all projects are loaded, rather than just the most recent
      // n projects -- important since courses often have more than n students!
      await redux.getActions("projects").load_all_projects();
      let project_map = redux.getStore("projects").get("project_map");
      if (project_map == null || webapp_client.account_id == null) {
        throw Error(
          "BUG -- project_map must be initialized and you must be signed in; try again later."
        );
      }

      // Make sure we're a collaborator on every student project.
      let changed = false;
      for (const student_id of ids) {
        if (this.course_actions.is_closed()) return;
        const project_id = store.getIn(["students", student_id, "project_id"]);
        if (project_id && !project_map.get(project_id)) {
          await webapp_client.project_collaborators.add_collaborator({
            account_id: webapp_client.account_id,
            project_id,
          });
          changed = true;
        }
      }
      if (changed) {
        // wait hopefully long enough for info about licenses to be
        // available in the project_map.  This is not 100% bullet proof,
        // but that is FINE because we only really depend on this to
        // slightly reduce doing extra work that is unlikely to be a problem.
        await delay(3000);
        project_map = redux.getStore("projects").get("project_map");
      }

      for (const student_id of ids) {
        if (this.course_actions.is_closed()) return;
        i += 1;
        const id1: number = this.course_actions.set_activity({
          desc: `Configuring student project ${i} of ${ids.length}`,
        });
        let license_id: string | undefined = undefined;
        if (licenseRunLimits != null) {
          // licenses being allocated globally.
          // What is there now for this project?
          const student_project_id = store.getIn([
            "students",
            student_id,
            "project_id",
          ]);
          const site_license = project_map?.getIn([
            student_project_id,
            "site_license",
          ]);
          let already_done: boolean = false;
          if (store.get_student(student_id)?.get("deleted")) {
            // remove license if student is deleted
            license_id = "";
            already_done = true;
          }
          for (const id in site_license) {
            if (licenseRunLimits[id] != null) {
              licenseRunLimits[id] -= 1;
              if (licenseRunLimits[id] >= 0) {
                already_done = true;
              }
            }
          }
          if (!already_done) {
            license_id = "";
            // choose an available license
            for (const id in licenseRunLimits) {
              if (licenseRunLimits[id] > 0) {
                license_id = id;
                licenseRunLimits[id] -= 1;
                break;
              }
            }
          }
        }
        await this.configure_project({
          student_id,
          student_project_id: undefined,
          force_send_invite_by_email: force,
          license_id,
        });
        this.course_actions.set_activity({ id: id1 });
        await delay(0); // give UI, etc. a solid chance to render
      } // always re-invite students on running this.
      await this.course_actions.shared_project.configure();
      await this.set_all_student_project_course_info();
    } catch (err) {
      this.course_actions.set_error(
        `Error configuring student projects - ${err}`
      );
    } finally {
      if (this.course_actions.is_closed()) return;
      this.course_actions.setState({ configuring_projects: false });
      this.course_actions.set_activity({ id });
    }
  }

  // Deletes student projects and removes students from those projects
  public async delete_all_student_projects(): Promise<void> {
    const store = this.get_store();

    const id = this.course_actions.set_activity({
      desc: "Deleting all student projects...",
    });
    try {
      const ids = store.get_student_ids({ deleted: false });
      if (ids == undefined) {
        return;
      }
      for (const student_id of ids) {
        await this.delete_student_project(student_id);
      }
    } catch (err) {
      this.course_actions.set_error(
        `error deleting a student project... ${err}`
      );
    } finally {
      this.course_actions.set_activity({ id });
    }
  }

  // upgrade_goal is a map from the quota type to the goal quota the instructor wishes
  // to get all the students to.
  public async upgrade_all_student_projects(
    upgrade_goal: UpgradeGoal
  ): Promise<void> {
    const store = this.get_store();
    const plan = store.get_upgrade_plan(upgrade_goal);
    if (len(plan) === 0) {
      // nothing to do
      return;
    }
    const id = this.course_actions.set_activity({
      desc: `Adjusting upgrades on ${len(plan)} student projects...`,
    });
    const a = redux.getActions("projects");
    const s = redux.getStore("projects");
    for (const project_id in plan) {
      if (project_id == null) continue;
      const upgrades = plan[project_id];
      if (upgrades == null) continue;
      // avoid race if projects are being created *right* when we
      // try to upgrade them.
      if (!s.has_project(project_id)) continue;
      await a.apply_upgrades_to_project(project_id, upgrades, false);
    }
    this.course_actions.set_activity({ id });
  }

  // Do an admin upgrade to all student projects.  This changes the base quotas for every student
  // project as indicated by the quotas object.  E.g., to increase the core quota from 1 to 2, do
  //         .admin_upgrade_all_student_projects(cores:2)
  // The quotas are: cores, cpu_shares, disk_quota, memory, mintime, network, member_host
  public async admin_upgrade_all_student_projects(quotas): Promise<void> {
    const account_store = redux.getStore("account");
    const groups = account_store.get("groups");
    if (groups && groups.includes("admin")) {
      throw Error("must be an admin to upgrade");
    }
    const store = this.get_store();
    const ids: string[] = store.get_student_project_ids();
    for (const project_id of ids) {
      const x = copy(quotas);
      x.project_id = project_id;
      await webapp_client.project_client.set_quotas(x);
    }
  }
}
