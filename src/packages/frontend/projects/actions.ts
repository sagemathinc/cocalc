/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Set } from "immutable";
import { isEqual } from "lodash";
import { alert_message } from "@cocalc/frontend/alerts";
import { Actions, redux } from "@cocalc/frontend/app-framework";
import { set_window_title } from "@cocalc/frontend/browser";
import { COCALC_MINIMAL } from "@cocalc/frontend/fullscreen";
import { markdown_to_html } from "@cocalc/frontend/markdown";
import type { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import { allow_project_to_run } from "@cocalc/frontend/project/client-side-throttle";
import { site_license_public_info } from "@cocalc/frontend/site-licenses/util";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { once } from "@cocalc/util/async-utils";
import {
  assert_uuid,
  copy,
  defaults,
  is_valid_uuid_string,
  len,
  server_minutes_ago,
} from "@cocalc/util/misc";
import { DEFAULT_QUOTAS } from "@cocalc/util/schema";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";
import { Upgrades } from "@cocalc/util/upgrades/types";
import { ProjectsState, store } from "./store";
import { load_all_projects, switch_to_project } from "./table";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import api from "@cocalc/frontend/client/api";
import type { StudentProjectFunctionality } from "@cocalc/util/db-schema/projects";
import startProjectPayg from "@cocalc/frontend/purchases/pay-as-you-go/start-project";

import type {
  CourseInfo,
  Datastore,
  EnvVars,
  EnvVarsRecord,
} from "@cocalc/util/db-schema/projects";
export type { Datastore, EnvVars, EnvVarsRecord };

// Define projects actions
export class ProjectsActions extends Actions<ProjectsState> {
  private async projects_table_set(
    obj: object,
    merge: "deep" | "shallow" | "none" | undefined = "deep",
  ): Promise<void> {
    const the_table = this.redux.getTable("projects");
    if (the_table == null) {
      // silently ignore -- this could only happen maybe right when closing the page...?
      return;
    }
    await the_table.set(obj, merge);
  }

  // Set something in the projects table of the database directly
  // using a query, instead of using sync'd table mechanism, which
  // is what projects_table_set does.
  private async projects_query_set(obj: object): Promise<void> {
    await webapp_client.async_query({
      query: {
        projects: obj,
      },
    });
  }

  private isProjectOpen = (project_id: string): boolean => {
    return store.get("open_projects").indexOf(project_id) != -1;
  };

  private setProjectOpen = (project_id: string): void => {
    const x = store.get("open_projects");
    const index = x.indexOf(project_id);
    if (index === -1) {
      this.setState({ open_projects: x.push(project_id) });
    }
  };

  // Do not call this directly to close a project.  Instead call
  //   redux.getActions('page').close_project_tab(project_id),
  // which calls this.
  public set_project_closed(project_id: string): void {
    const x = store.get("open_projects");
    const index = x.indexOf(project_id);
    if (index !== -1) {
      redux.removeProjectReferences(project_id);
      this.setState({ open_projects: x.delete(index) });
    }
  }

  // Save all open files in all projects to disk
  public save_all_files(): void {
    store.get("open_projects").filter((project_id) => {
      // ? is fine here since if project just got closed or collaborator
      // removed from it, etc., that would be fine.  Save all is
      // just a convenience for autosave. See
      // https://github.com/sagemathinc/cocalc/issues/4789
      this.redux.getProjectActions(project_id)?.save_all_files();
    });
  }

  /*
  Returns true only if we are a collaborator/user of this project
  and have loaded it.  Should check this before changing anything
  in the projects table!  Otherwise, bad things will happen.
  This may also trigger load_all_projects.
  */
  private async have_project(project_id: string): Promise<boolean> {
    const t = this.redux.getTable("projects")?._table;
    if (t == null) {
      // called before initialization... -- shouldn't ever happen,
      // but we don't have the project at this point:
      return false;
    }
    if (!t.is_ready()) {
      if (t.get_state() == "closed") {
        throw Error("can't use projects table after it is closed");
      }
      // table isn't ready to be used yet -- wait for it.
      await once(t, "connected");
    }
    // now t is ready and we can query it.
    if (t.get(project_id) != null) {
      // we know this project
      return true;
    }
    if (store.get("all_projects_have_been_loaded")) {
      return false;
    }
    // be sure by first loading all projects
    await this.load_all_projects();
    // and try again.  Because we loaded all projects,
    // we won't hit infinite recurse.
    return await this.have_project(project_id);
  }

  public async set_project_title(
    project_id: string,
    title: string,
  ): Promise<void> {
    if (!(await this.have_project(project_id))) {
      console.warn(
        `Can't set title -- you are not a collaborator on project '${project_id}'.`,
      );
      return;
    }
    if (store.get_title(project_id) === title) {
      // title is already set as requested; nothing to do
      return;
    }
    // set in the Table
    await this.projects_table_set({ project_id, title });
    // create entry in the project's log
    await this.redux.getProjectActions(project_id).async_log({
      event: "set",
      title,
    });
  }

  public async set_project_description(
    project_id: string,
    description: string,
  ): Promise<void> {
    if (!(await this.have_project(project_id))) {
      console.warn(
        `Can't set description -- you are not a collaborator on project '${project_id}'.`,
      );
      return;
    }
    if (store.get_description(project_id) === description) {
      // description is already set as requested; nothing to do
      return;
    }
    // set in the Table
    await this.projects_table_set({ project_id, description });
    // create entry in the project's log
    await this.redux.getProjectActions(project_id).async_log({
      event: "set",
      description,
    });
  }

  public async set_project_name(
    project_id: string,
    name: string,
  ): Promise<void> {
    if (!(await this.have_project(project_id))) {
      console.warn(
        `Can't set project name -- you are not a collaborator on project '${project_id}'.`,
      );
      return;
    }
    // set in the Table
    await this.projects_table_set({ project_id, name });
    // create entry in the project's log
    await this.redux.getProjectActions(project_id).async_log({
      event: "set",
      name,
    });
  }

  // creates and stores image as a blob in the database.
  // stores sha1 of that blog in projects map and also returns
  // the sha1.
  public async setProjectImage(
    project_id: string,
    {
      full,
      tiny,
    }: {
      full: string; // full size image
      tiny: string; // tiny image
    },
  ) {
    if (tiny.length > 10000) {
      // quick sanity check
      throw Error("bug -- tiny image is way too large");
    }
    await this.projects_query_set({ project_id, avatar_image_full: full });
    await this.projects_table_set({ project_id, avatar_image_tiny: tiny });
    await this.redux.getProjectActions(project_id).async_log({
      event: "set",
      image: tiny,
    });
  }

  public async add_ssh_key_to_project(opts: {
    project_id: string;
    fingerprint: string;
    title: string;
    value: string;
  }): Promise<void> {
    await this.projects_table_set({
      project_id: opts.project_id,
      users: {
        [this.redux.getStore("account").get_account_id()]: {
          ssh_keys: {
            [opts.fingerprint]: {
              title: opts.title,
              value: opts.value,
              creation_date: Date.now(),
            },
          },
        },
      },
    });
  }

  public async delete_ssh_key_from_project(opts: {
    project_id: string;
    fingerprint: string;
  }): Promise<void> {
    await this.projects_table_set({
      project_id: opts.project_id,
      users: {
        [this.redux.getStore("account").get_account_id()]: {
          ssh_keys: {
            [opts.fingerprint]: null,
          },
        },
      },
    });
  }

  // Apply default upgrades -- if available -- to the given project.
  // Right now this means upgrading to member hosting and enabling
  // network access.  Later this could mean something else (e.g., a license code)
  // or be configurable by the user.
  public async apply_default_upgrades(opts: {
    project_id: string;
  }): Promise<void> {
    // WARNING/TODO: This may be invalid if redux.getActions('billing')?.update_customer() has
    // not been recently called. There's no big *harm* if it is out of date (since quotas will
    // just get removed when the project is started), but it could be mildly confusing.
    const total = redux.getStore("account").get_total_upgrades();
    // anonymous users: total is undefined
    if (total == null) return;
    const applied = store.get_total_upgrades_you_have_applied();
    const to_upgrade = {};
    for (let quota of ["member_host", "network", "always_running"]) {
      const avail = (total[quota] ?? 0) - (applied?.[quota] ?? 0);
      if (avail > 0) {
        to_upgrade[quota] = 1;
      }
    }
    if (len(to_upgrade) > 0) {
      await this.apply_upgrades_to_project(opts.project_id, to_upgrade);
    }
  }

  set_project_course_info = async ({
    project_id,
    course_project_id,
    path,
    pay = "",
    payInfo,
    account_id,
    email_address,
    datastore,
    type,
    student_project_functionality,
    envvars,
  }: {
    project_id: string;
    course_project_id: string;
    path: string;
    pay?: Date | string;
    payInfo?: PurchaseInfo | null;
    account_id?: string | null;
    email_address?: string | null;
    datastore?: Datastore;
    type: "student" | "shared" | "nbgrader" | "exam" | "group";
    student_project_functionality?: StudentProjectFunctionality | null;
    envvars?: EnvVars;
  }): Promise<void | { course: null | CourseInfo }> => {
    if (!(await this.have_project(project_id))) {
      const msg = `Can't set course info -- you are not a collaborator on project '${project_id}'.`;
      console.warn(msg);
      return;
    }
    const course_info = store.get_course_info(project_id)?.toJS();
    const course: CourseInfo = {
      project_id: course_project_id,
      path,
      pay: typeof pay != "string" ? pay.toISOString() : pay,
      payInfo: payInfo ?? undefined,
      datastore,
      type,
    };
    if (type == "student" && student_project_functionality != null) {
      course.student_project_functionality = student_project_functionality;
    }
    if (typeof envvars?.inherit === "boolean") {
      course.envvars = envvars;
    }
    // account_id and email is null for shared/nbgrader project, otherwise student project
    // the corresponding check of the two fields below is the
    // is_student = ... or-test in ProjectsStore::date_when_course_payment_required
    if (account_id != null) {
      course.account_id = account_id;
    }
    if (email_address != null) {
      course.email_address = email_address;
    }
    // lodash.isEqual: deep comparison of two objects
    if (isEqual(course_info, course)) {
      // already set as required; do nothing
      return;
    }
    return await api("projects/course/set-course-info", { project_id, course });
  };

  // Create a new project; returns the project_id of the new project.
  public async create_project(opts: {
    title?: string;
    description?: string;
    image?: string; // if given, sets the compute image (the ID string)
    start?: boolean; // immediately start on create
    noPool?: boolean; // never use the pool
    license?: string;
  }): Promise<string> {
    const image = await redux.getStore("customize").getDefaultComputeImage();

    const opts2: {
      title: string;
      description: string;
      image?: string;
      start: boolean;
      noPool?: boolean;
      license?: string;
    } = defaults(opts, {
      title: "No Title",
      description: "No Description",
      image,
      start: false,
      noPool: undefined,
      license: undefined,
    });
    if (!opts2.image) {
      // make falseish same as not specified.
      delete opts2.image;
    }

    const project_id = await webapp_client.project_client.create(opts2);

    // At this point we know the project_id and that the project exists.
    // However, various code (e.g., setting the title) depends on the
    // project_map also having the project in it, which requires some
    // changefeeds to fire off and get handled.  So we wait for that.
    await store.async_wait({
      until: () => store.getIn(["project_map", project_id]) != null,
    });
    return project_id;
  }

  // Open the given project
  public async open_project(opts: {
    project_id: string; //  id of the project to open
    target?: string; // The file path to open
    fragmentId?: FragmentId; //  if given, an uri fragment in the editor that is opened.
    switch_to?: boolean; // (default: true) Whether or not to foreground it
    ignore_kiosk?: boolean; // Ignore ?fullscreen=kiosk
    change_history?: boolean; // (default: true) Whether or not to alter browser history
    restore_session?: boolean; // (default: true)  Opens up previously closed editor tabs
  }) {
    opts = defaults(opts, {
      project_id: undefined,
      target: undefined,
      fragmentId: undefined,
      switch_to: true,
      ignore_kiosk: false,
      change_history: true,
      restore_session: true,
    });
    if (!is_valid_uuid_string(opts.project_id)) {
      throw Error(`invalid project_id - ${opts.project_id}`);
    }

    if (!store.getIn(["project_map", opts.project_id])) {
      if (COCALC_MINIMAL) {
        await switch_to_project(opts.project_id);
      } else {
        // trying to open a not-known project -- maybe
        // we have not yet loaded the full project list?
        await this.load_all_projects();
      }
    }
    const project_actions = redux.getProjectActions(opts.project_id);
    let relation = store.get_my_group(opts.project_id);
    if (relation == "public" && webapp_client.account_id) {
      // try adding ourselves, e.g., maybe project is a sandbox.
      try {
        await webapp_client.project_collaborators.add_collaborator({
          project_id: opts.project_id,
          account_id: webapp_client.account_id,
        });
      } catch (err) {
        console.log(err);
      }
    }
    if (relation == null || ["public", "admin"].includes(relation)) {
      this.fetch_public_project_title(opts.project_id);
    }
    project_actions.fetch_directory_listing();
    if (opts.switch_to) {
      redux
        .getActions("page")
        .set_active_tab(opts.project_id, opts.change_history);
    }
    if (!this.isProjectOpen(opts.project_id)) {
      this.setProjectOpen(opts.project_id);
      if (opts.restore_session) {
        redux.getActions("page").restore_session(opts.project_id);
      }
    }
    if (opts.target != null) {
      project_actions.load_target(
        opts.target,
        opts.switch_to,
        opts.ignore_kiosk,
        opts.change_history,
        opts.fragmentId,
      );
    }
    // initialize project
    project_actions.init();
  }

  // tab at old_index taken out and then inserted into the resulting array's new index
  public move_project_tab({
    old_index,
    new_index,
  }: {
    old_index: number;
    new_index: number;
  }) {
    const x = store.get("open_projects");
    const item = x.get(old_index);
    if (item == null) return;
    const temp_list = x.delete(old_index);
    const open_projects = temp_list.splice(new_index, 0, item);
    this.setState({ open_projects });
    redux.getActions("page").save_session();
  }

  public async load_target(
    target?: string,
    switch_to?: boolean,
    ignore_kiosk?: boolean,
    change_history?: boolean,
    fragmentId?: FragmentId,
  ): Promise<void> {
    if (!target || target.length === 0) {
      redux.getActions("page").set_active_tab("projects");
      return;
    }
    const segments = target.split("/");
    if (is_valid_uuid_string(segments[0])) {
      const t = segments.slice(1).join("/");
      const project_id = segments[0];
      await this.open_project({
        project_id,
        target: t,
        fragmentId,
        switch_to,
        ignore_kiosk,
        change_history,
        restore_session: false,
      });
    }
  }

  // Put the given project in the foreground
  public async foreground_project(
    project_id: string,
    change_history: boolean = true,
  ): Promise<void> {
    redux.getActions("page").set_active_tab(project_id, change_history);

    // the database often isn't loaded at this moment (right when user refreshes)
    await store.async_wait({
      until: (s) => s.get_title(project_id) != null,
    });
    set_window_title(store.get_title(project_id)); // change title bar
  }

  // Given the id of a public project, make it so that sometime
  // in the future the projects store knows the corresponding title,
  // (at least what it is right now).  For convenience this works
  // even if the project isn't public if the user is an admin, and also
  // works on projects the user owns or collaborates on.
  // NOTE: this could mistitle the project "No Title" in case of a network
  // or database fail at the wrong moment; but this is really only used by
  // admins (who should usually be impersonating users instead!),
  // so not a serious concern.
  public async fetch_public_project_title(project_id: string): Promise<string> {
    let group;
    try {
      await store.async_wait({
        until: () => store.get_my_group(project_id) != null,
        timeout: 60,
      });
      group = store.get_my_group(project_id);
    } catch (err) {
      group = "public";
    }
    let table;
    switch (group) {
      case "admin":
        table = "projects_admin";
        break;
      case "owner":
      case "collaborator":
        table = "projects";
        break;
      default:
        table = "public_projects";
    }
    let resp: any = undefined;
    try {
      resp = await webapp_client.async_query({
        query: {
          [table]: { project_id, title: null },
        },
      });
    } catch (_) {
      // ignore err, since we just fall back to "No Title" below.
    }
    let title = resp?.query?.[table]?.title ?? "No Title";
    this.setState({
      public_project_titles: store
        .get("public_project_titles")
        .set(project_id, title),
    });
    return title;
  }

  // The next few actions below involve changing the users field
  // of a project.   See the users field of
  //      @cocalc/util/db-schema/project.ts
  // for documentation of the structure of this.

  /*
   * Collaborators
   */
  public async remove_collaborator(
    project_id: string,
    account_id: string,
  ): Promise<void> {
    const removed_name = redux.getStore("users").get_name(account_id);
    try {
      await webapp_client.project_collaborators.remove({
        project_id,
        account_id,
      });
      await this.redux
        .getProjectActions(project_id)
        .async_log({ event: "remove_collaborator", removed_name });
    } catch (err) {
      const message = `Error removing ${removed_name} from project ${project_id} -- ${err}`;
      alert_message({ type: "error", message });
    }
  }

  // this is for inviting existing users, the email is only known by the back-end
  public async invite_collaborator(
    project_id: string,
    account_id: string,
    body?: string, // if not set and nonempty, no email will be sent
    subject?: string,
    silent?: boolean, // if true, don't show error message on fail
    replyto?: string,
    replyto_name?: string,
  ): Promise<void> {
    await this.redux.getProjectActions(project_id).async_log({
      event: "invite_user",
      invitee_account_id: account_id,
    });

    const title = store.get_title(project_id);
    const link2proj = `https://${window.location.hostname}/projects/${project_id}/`;
    // convert body from markdown to html, which is what the backend expects
    const email = body != null ? markdown_to_html(body) : undefined;

    try {
      await webapp_client.project_collaborators.invite({
        project_id,
        account_id,
        title,
        link2proj,
        replyto,
        replyto_name,
        email,
        subject,
      });
    } catch (err) {
      if (!silent) {
        const message = `Error inviting collaborator ${account_id} from ${project_id} -- ${err}`;
        alert_message({ type: "error", message });
      }
    }
  }

  // this is for inviting non-existing users, email is set via the UI
  public async invite_collaborators_by_email(
    project_id: string,
    to: string,
    body: string,
    subject: string,
    silent: boolean,
    replyto: string | undefined,
    replyto_name: string | undefined,
  ): Promise<void> {
    await this.redux.getProjectActions(project_id).async_log({
      event: "invite_nonuser",
      invitee_email: to,
    });

    const title = store.get_title(project_id);
    if (body == null) {
      const name = this.redux.getStore("account").get_fullname();
      body = `Please collaborate with me using CoCalc on '${title}'.\n\n\n--\n${name}`;
    }
    const link2proj = `https://${window.location.hostname}/projects/${project_id}/`;
    const email = markdown_to_html(body);

    try {
      const resp = await webapp_client.project_collaborators.invite_noncloud({
        project_id,
        title,
        link2proj,
        replyto,
        replyto_name,
        to,
        email,
        subject,
      });
      if (!silent) {
        alert_message({ message: resp.mesg });
      }
    } catch (err) {
      if (!silent) {
        const message = `Error inviting collaborator ${to} from ${project_id} -- ${err}`;
        alert_message({ type: "error", message, timeout: 60 });
      }
    }
  }

  /*
   * Upgrades
   */
  // - upgrades is a map from upgrade parameters to integer values.
  // - The upgrades get merged into any other upgrades this user may have already applied,
  //   unless merge=false (the third option)
  public async apply_upgrades_to_project(
    project_id: string,
    upgrades: Upgrades,
    merge: boolean = true,
  ): Promise<void> {
    assert_uuid(project_id);
    const account_id = this.redux.getStore("account").get_account_id();
    if (!account_id) {
      throw Error("user must be signed in");
    }
    if (!merge) {
      // explicitly set every field not specified to 0
      upgrades = copy(upgrades);
      for (let quota in DEFAULT_QUOTAS) {
        if (upgrades[quota] == null) {
          upgrades[quota] = 0;
        }
      }
    }
    // Will anything change?
    const cur =
      store
        .getIn(["project_map", project_id, "users", account_id, "upgrades"])
        ?.toJS() ?? {};
    let nothing_will_change: boolean = true;
    for (let quota in DEFAULT_QUOTAS) {
      if ((upgrades[quota] ?? 0) != (cur[quota] ?? 0)) {
        nothing_will_change = false;
        break;
      }
    }
    if (nothing_will_change) {
      return;
    }

    await this.projects_table_set({
      project_id,
      users: {
        [account_id]: { upgrades },
      },
    });
    // log the change in the project log
    await this.project_log(project_id, {
      event: "upgrade",
      upgrades,
    });
  }

  // Remove any upgrades and site licenses applied to this project.
  public async clear_project_upgrades(project_id: string): Promise<void> {
    assert_uuid(project_id);
    await this.apply_upgrades_to_project(project_id, {}, false);
    await this.remove_site_license_from_project(project_id);
  }

  // Use a site license key to upgrade a project.  This only has an
  // impact on actual upgrades when the project is restarted.
  // Multiple licenses can be included in license_id separated
  // by commas to add several at once.
  public async add_site_license_to_project(
    project_id: string,
    license_id: string,
  ): Promise<void> {
    if (license_id.indexOf(",") != -1) {
      for (const id of license_id.split(",")) {
        await this.add_site_license_to_project(project_id, id);
      }
      return;
    }
    if (!is_valid_uuid_string(license_id)) {
      throw Error(
        `invalid license key '${license_id}' -- it must be a 36-character valid v4 uuid`,
      );
    }
    const project = store.getIn(["project_map", project_id]);
    if (project == null) {
      throw Error("unknown project -- can't add license to it");
    }
    const site_license = project.get("site_license")?.toJS() ?? {};
    if (site_license[license_id] != null) {
      return;
    }
    site_license[license_id] = {};
    await this.projects_table_set({ project_id, site_license }, "shallow");
    this.log_site_license_change(project_id, license_id, "add");
  }

  // Removes a given (or all) site licenses from a project. If license_id is empty
  // string (or not set) then removes all of them.
  // Multiple licenses can be included in license_id separated
  // by commas to remove several at once.
  public async remove_site_license_from_project(
    project_id: string,
    license_id: string = "",
  ): Promise<void> {
    if (license_id.indexOf(",") != -1) {
      for (const id of license_id.split(",")) {
        await this.remove_site_license_from_project(project_id, id);
      }
      return;
    }

    const project = store.getIn(["project_map", project_id]);
    if (project == null) {
      return; // nothing to do
    }
    const site_license = project.get("site_license")?.toJS() ?? {};
    if (!license_id && len(site_license) === 0) {
      // common special case that is easy
      return;
    }
    // The null stuff here is confusing, but that's just because our
    // SyncTable functionality makes deleting things tricky.
    if (license_id) {
      if (site_license[license_id] == null) {
        return;
      }
      site_license[license_id] = null;
    } else {
      for (let x in site_license) {
        site_license[x] = null;
      }
    }
    await this.projects_table_set({ project_id, site_license }, "shallow");
    this.log_site_license_change(project_id, license_id, "remove");
  }

  private async log_site_license_change(
    project_id: string,
    license_id: string,
    action: "add" | "remove",
  ): Promise<void> {
    if (!is_valid_uuid_string(project_id)) {
      throw Error(`invalid project_id "${project_id}"`);
    }
    if (license_id.includes(",")) {
      for (const id of license_id.split(",")) {
        this.log_site_license_change(project_id, id, action);
      }
      return;
    }

    let info;
    if (!license_id) {
      info = { title: "All licenses" };
      action = "remove";
    } else {
      if (!is_valid_uuid_string(license_id)) {
        throw Error(`invalid license_id "${license_id}"`);
      }
      try {
        info = await site_license_public_info(license_id);
      } catch (err) {
        // happens if the license is not valid.
        info = { title: `${err}` };
      }
    }
    if (!info) return;
    const quota: SiteLicenseQuota | undefined = info.quota;
    const title: string = info.title ?? "";
    await this.project_log(project_id, {
      event: "license",
      action,
      license_id,
      quota,
      title,
    });
  }

  public async project_log(project_id: string, entry): Promise<void> {
    await this.redux.getProjectActions(project_id).log(entry);
  }

  // Sets site licenses for project to exactly license_id.
  // Multiple licenses can be included in license_id separated
  // by commas to set several at once.
  public async set_site_license(
    project_id: string,
    license_id: string = "",
  ): Promise<void> {
    const project = store.getIn(["project_map", project_id]);
    if (project == null) {
      return; // nothing to do -- not a project we know/manage
    }
    const site_license = project.get("site_license")?.toJS() ?? {};
    if (!license_id && len(site_license) === 0) {
      // common special case that is easy -- set to empty and is already empty
      return;
    }
    let changed: boolean = false;
    for (const id in site_license) {
      if (license_id.indexOf(id) == -1) {
        changed = true;
        site_license[id] = null;
        this.log_site_license_change(project_id, license_id, "remove");
      }
    }
    for (const id of license_id.split(",")) {
      if (site_license[id] == null) {
        changed = true;
        site_license[id] = {};
        this.log_site_license_change(project_id, license_id, "add");
      }
    }
    if (changed) {
      await this.projects_table_set({ project_id, site_license }, "shallow");
    }
  }

  private current_action_request(project_id: string): string | undefined {
    const action_request = store.getIn([
      "project_map",
      project_id,
      "action_request",
    ]);
    if (action_request == null || action_request.get("action") == null) {
      // definitely nothing going on now.
      return undefined;
    }
    const request_time = new Date(action_request.get("time"));
    if (action_request.get("finished") >= request_time) {
      // also definitely nothing going on, since finished time is greater than
      // when we requested an action.
      return undefined;
    }
    if (request_time <= server_minutes_ago(10)) {
      // action_requst is old; just ignore it.
      return undefined;
    }

    return action_request.get("action");
  }

  // return true, if it actually started the project
  public async start_project(
    project_id: string,
    options: { disablePayAsYouGo?: boolean } = {},
  ): Promise<boolean> {
    if (!(await allow_project_to_run(project_id))) {
      return false;
    }
    const state = store.get_state(project_id);
    if (state == "starting" || state == "running" || state == "stopping") {
      return false;
    }
    if (!options.disablePayAsYouGo) {
      const quota = store
        .getIn([
          "project_map",
          project_id,
          "pay_as_you_go_quotas",
          webapp_client.account_id ?? "",
        ])
        ?.toJS();
      if (quota?.enabled) {
        return await startProjectPayg({ project_id, quota });
      }
    }

    let did_start = false;
    const t0 = webapp_client.server_time().getTime();
    const action_request = this.current_action_request(project_id);
    if (action_request == null || action_request != "start") {
      // need to make an action request:
      this.project_log(project_id, {
        event: "project_start_requested",
      });
      await this.projects_table_set({
        project_id,
        action_request: {
          action: "start",
          time: webapp_client.server_time(),
        },
      });
      did_start = true;
    }
    // Wait until it is running
    await store.async_wait({
      timeout: 120,
      until(store) {
        return store.get_state(project_id) == "running";
      },
    });
    this.project_log(project_id, {
      event: "project_started",
      duration_ms: webapp_client.server_time().getTime() - t0,
      ...store.classify_project(project_id),
    });
    return did_start;
  }

  // returns true, if it acutally stopped the project
  public async stop_project(project_id: string): Promise<boolean> {
    const state = store.get_state(project_id);
    if (state == "stopping" || state == "opened" || state == "starting") {
      return false;
    }
    let did_stop = false;
    const t0 = webapp_client.server_time().getTime();
    const action_request = this.current_action_request(project_id);
    if (action_request == null || action_request != "stop") {
      // need to do it!
      this.project_log(project_id, {
        event: "project_stop_requested",
      });
      await this.projects_table_set({
        project_id,
        action_request: { action: "stop", time: webapp_client.server_time() },
      });
      did_stop = true;
    }

    // Wait until it is no longer running or stopping.  We don't
    // wait for "opened" because something or somebody else could
    // have started the project and we missed that, and don't
    // want to get stuck.
    await store.async_wait({
      timeout: 60,
      until(store) {
        const state = store.get_state(project_id);
        return state != "running" && state != "stopping";
      },
    });
    this.project_log(project_id, {
      event: "project_stopped",
      duration_ms: webapp_client.server_time().getTime() - t0,
      ...store.classify_project(project_id),
    });
    return did_stop;
  }

  public async restart_project(project_id: string, options?): Promise<void> {
    if (!(await allow_project_to_run(project_id))) {
      return;
    }
    this.project_log(project_id, {
      event: "project_restart_requested",
    });
    const state = store.get_state(project_id);
    if (state == "running") {
      await this.stop_project(project_id);
    }
    await this.start_project(project_id, options);
  }

  // Explcitly set whether or not project is hidden for the given account
  // (hide=true means hidden)
  public async set_project_hide(
    account_id: string,
    project_id: string,
    hide: boolean,
  ): Promise<void> {
    await this.projects_table_set({
      project_id,
      users: {
        [account_id]: {
          hide,
        },
      },
    });
    await this.project_log(project_id, {
      event: hide ? "hide_project" : "unhide_project",
    });
  }

  // Toggle whether or not project is hidden project
  public async toggle_hide_project(project_id: string): Promise<void> {
    const account_id = this.redux.getStore("account").get_account_id();
    const hide = store.is_hidden_from(project_id, account_id);
    await this.set_project_hide(account_id, project_id, !hide);
  }

  public async set_project_sandbox(
    project_id: string,
    sandbox: boolean,
  ): Promise<void> {
    await this.projects_table_set({
      project_id,
      sandbox,
    });
    await this.project_log(project_id, { event: "sandbox_project", sandbox });
  }

  public async delete_project(project_id: string): Promise<void> {
    await this.clear_project_upgrades(project_id);
    await this.projects_table_set({
      project_id,
      deleted: true,
    });
    await this.project_log(project_id, { event: "delete_project" });
  }

  // Toggle whether or not project is deleted.
  public async toggle_delete_project(project_id: string): Promise<void> {
    const is_deleted = store.is_deleted(project_id);
    if (!is_deleted) {
      await this.clear_project_upgrades(project_id);
    }

    await this.projects_table_set({
      project_id,
      deleted: !is_deleted,
    });
    await this.project_log(project_id, {
      event: is_deleted ? "undelete_project" : "delete_project",
    });
  }

  public display_hidden_projects(hidden: boolean): void {
    this.setState({ hidden });
  }

  public display_deleted_projects(deleted): void {
    this.setState({ deleted });
  }

  public async load_all_projects(): Promise<void> {
    if (store.get("all_projects_have_been_loaded")) {
      return;
    }
    await load_all_projects();
    this.setState({ all_projects_have_been_loaded: true });
  }

  public toggle_hashtag(filter: string, tag: string): void {
    let selected_hashtags = store.get("selected_hashtags");
    let hashtags = selected_hashtags.get(filter, Set<string>());
    if (hashtags.has(tag)) {
      hashtags = hashtags.delete(tag);
    } else {
      hashtags = hashtags.add(tag);
    }
    selected_hashtags = selected_hashtags.set(filter, hashtags);
    this.setState({ selected_hashtags });
  }
}

// Register projects actions
export function init() {
  redux.createActions("projects", ProjectsActions);
}
