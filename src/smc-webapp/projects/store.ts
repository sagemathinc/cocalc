/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List, Map, Set } from "immutable";
import { redux, Store } from "../app-framework";
import { webapp_client } from "../webapp-client";
import {
  copy,
  coerce_codomain_to_numbers,
  cmp,
  keys,
  len,
  map_sum,
  months_before,
} from "smc-util/misc";
import { CUSTOM_IMG_PREFIX } from "../custom-software/util";
import { max_quota, site_license_quota } from "smc-util/upgrades/quota";

import { PROJECT_UPGRADES } from "smc-util/schema";
import { fromPairs } from "lodash";
const ZERO_QUOTAS = fromPairs(
  Object.keys(PROJECT_UPGRADES.params).map((x) => [x, 0])
);

import { Upgrades } from "smc-util/upgrades/types";
import { has_internet_access } from "../upgrades/upgrade-utils";

import { WebsocketState } from "../project/websocket/websocket-state";

export type ProjectMap = Map<string, Map<string, any>>;

export interface ProjectsState {
  project_map?: ProjectMap;
  open_projects: List<string>; // the opened projects in *tab* order

  search: string;
  deleted: boolean;
  hidden: boolean;
  selected_hashtags: Map<string, Set<string>>;

  all_projects_have_been_loaded: boolean;

  public_project_titles: Map<string, any>;

  project_websockets: Map<string, WebsocketState>;
}

// Define projects store
export class ProjectsStore extends Store<ProjectsState> {
  // Return true if the given project_id is of a project that is
  // currently known.
  public has_project(project_id: string): boolean {
    return this.get("project_map")?.has(project_id) ?? false;
  }

  /*
  Given an array of objects with an account_id field, sort it
  by the corresponding last_active timestamp for these users
  on the given project, starting with most recently active.
  Also, adds the last_active timestamp field to each element
  of users given their timestamp for activity *on this project*.
  For global activity (not just on a project) use
  the sort_by_activity of the users store.
  */
  public sort_by_activity(
    users: { account_id: string; last_active?: Date }[],
    project_id: string
  ): { account_id: string; last_active?: Date }[] {
    const last_active = this.getIn(["project_map", project_id, "last_active"]);
    if (last_active == null) {
      // no info
      return users;
    }
    for (let user of users) {
      user.last_active = last_active.get(user.account_id, 0);
    }
    // the code below sorts by last-active in reverse order, if defined; otherwise by last name (or as tie breaker)
    const last_name = (account_id) =>
      redux.getStore("users").get_last_name(account_id);

    return users.sort((a, b) => {
      const c = cmp(b.last_active, a.last_active);
      if (c) {
        return c;
      } else {
        return cmp(last_name(a.account_id), last_name(b.account_id));
      }
    });
  }

  public get_users(
    project_id: string
  ): Map<string, Map<string, any>> | undefined {
    return this.getIn(["project_map", project_id, "users"]);
  }

  public get_last_active(
    project_id: string
  ): Map<string, Map<string, Date>> | undefined {
    return this.getIn(["project_map", project_id, "last_active"]);
  }

  public get_title(project_id: string): string {
    return this.getIn(["project_map", project_id, "title"]) ?? "No Title";
  }

  public get_state(project_id: string): string | undefined {
    return this.getIn(["project_map", project_id, "state", "state"]);
  }

  public get_description(project_id: string): string {
    return (
      this.getIn(["project_map", project_id, "description"]) ?? "No Description"
    );
  }

  public get_created(project_id: string): Date | undefined {
    return this.getIn(["project_map", project_id, "created"]);
  }

  // Info about a student project that is part of a
  // course (will be undefined if not a student project)
  public get_course_info(project_id: string): Map<string, any> | undefined {
    return this.getIn(["project_map", project_id, "course"]);
  }

  public is_student_project(project_id: string): boolean {
    return !!this.get_course_info(project_id);
  }

  /*
  If a course payment is required for this project from the signed in user,
  returns time when it will be required; otherwise, returns undefined.
  POLICY: payment is required from the the time set in the .course file
  until 3 months later.  After the course is (nearly) over, payment is
  then **no longer** required, and this function again returns undefined.
  This is so students have access to their work even after their subscription
  has expired.
  */
  public date_when_course_payment_required(
    project_id: string
  ): undefined | Date {
    const account = redux.getStore("account");
    if (account == null) {
      return;
    }
    const info = this.get_course_info(project_id);
    if (info == null) {
      return;
    }
    const is_student =
      info.get("account_id") == webapp_client.account_id ||
      info.get("email_address") == account.get("email_address");
    if (is_student && !this.is_deleted(project_id)) {
      // signed in user is the student
      let pay = info.get("pay");
      if (pay === true) {
        // bug -- can delete this workaround in March 2019.
        pay = new Date("2019-02-15");
      }
      if (pay) {
        if (webapp_client.server_time() >= months_before(-3, pay)) {
          // It's 3 months after date when sign up required, so course likely over,
          // and we no longer require payment
          return;
        }
        // payment is required at some point
        if (this.get_total_project_quotas(project_id)?.member_host) {
          // already paid -- thanks
          return;
        } else {
          // need to pay, but haven't -- this is the time by which they must pay
          return pay;
        }
      }
    }
  }

  public is_deleted(project_id: string): boolean {
    return !!this.getIn(["project_map", project_id, "deleted"]);
  }

  public is_hidden_from(project_id: string, account_id: string): boolean {
    return !!this.getIn([
      "project_map",
      project_id,
      "users",
      account_id,
      "hide",
    ]);
  }

  /*
  Return the group that the current user has on this project,
  which can be one of:
     'owner', 'collaborator', 'public', 'admin' or undefined, where
  undefined -- means the information needed to determine
  group hasn't been loaded yet.
  'owner' - the current user owns the project
  'collaborator' - current user is a collaborator on the project
  'public' - user is possibly not logged in or is not an
       admin and not on the project at all
  'admin' - user is not owner/collaborator but is an admin, hence has rights.
  */
  public get_my_group(project_id: string): undefined | string {
    const account_store = redux.getStore("account");
    if (account_store == null) {
      return;
    }
    const user_type = account_store.get_user_type();
    if (user_type === "public") {
      // Not logged in -- so not in group.
      return "public";
    }
    if (this.get("project_map") == null) {
      // signed in, but waiting for projects store to load
      return;
    }
    const account_id = account_store.get("account_id");
    if (account_id == null) {
      // signed in but table with full account info has not been initialized.
      return;
    }
    const project = this.getIn(["project_map", project_id]);
    if (project == null) {
      if (account_store.get("is_admin")) {
        return "admin";
      } else {
        return "public";
      }
    }
    const users = project.get("users");
    const me = users?.get(account_id);
    if (me == null) {
      if (account_store.get("is_admin")) {
        return "admin";
      } else {
        return "public";
      }
    }
    return me.get("group");
  }

  public is_collaborator(project_id: string): boolean {
    return (
      webapp_client.account_id != null &&
      this.getIn(["project_map", project_id, webapp_client.account_id]) != null
    );
  }

  public is_project_open(project_id: string): boolean {
    return this.get("open_projects").includes(project_id);
  }

  public wait_until_project_is_open(
    project_id: string,
    timeout: number, // timeout in seconds (NOT milliseconds!)
    cb: (err?) => void
  ): void {
    this.wait({
      until: () => this.is_project_open(project_id),
      timeout,
      cb,
    });
  }

  public wait_until_project_exists(
    project_id: string,
    timeout: number,
    cb: (err?) => void
  ): void {
    this.wait({
      until: () => this.getIn(["project_map", project_id]) != null,
      timeout,
      cb,
    });
  }

  // Returns the total amount of upgrades that this user has allocated
  // across all their projects.
  public get_total_upgrades_you_have_applied(): Upgrades | undefined {
    if (this.get("project_map") == null) {
      return;
    }
    let total: Upgrades = {};
    this.get("project_map")?.map((project) => {
      const upgrades = project
        .getIn(["users", webapp_client.account_id, "upgrades"])
        ?.toJS();
      if (upgrades == null) return;
      total = map_sum(total, upgrades);
    });
    return total;
  }

  public get_upgrades_you_applied_to_project(project_id): undefined | Upgrades {
    if (webapp_client.account_id == null) return;
    return this.getIn([
      "project_map",
      project_id,
      "users",
      webapp_client.account_id,
      "upgrades",
    ])?.toJS();
  }

  /*
  Get the individual users's contributions to the project's upgrades
  mapping (or undefined) =
      memory  :
          account_id         : 1000
          another_account_id : 2000
      network :
          account_id : 1
  etc. with other upgrades and maps of account ids to upgrade amount
  */
  public get_upgrades_to_project(project_id: string): undefined | Upgrades {
    const users = this.getIn(["project_map", project_id, "users"])?.toJS();
    if (users == null) {
      return;
    }
    const upgrades = {};
    for (let account_id in users) {
      const info = users[account_id];
      const object = info.upgrades != null ? info.upgrades : {};
      for (let prop in object) {
        const val = object[prop];
        if (val > 0) {
          if (upgrades[prop] == null) {
            upgrades[prop] = {};
          }
          upgrades[prop][account_id] = val;
        }
      }
    }
    return upgrades;
  }

  /*
  Get the sum of all the upgrades given to the project by all users
  mapping (or undefined) =
      memory  : 3000
      network : 2
  */
  public get_total_project_upgrades(project_id: string): undefined | Upgrades {
    const users = this.getIn(["project_map", project_id, "users"])?.toJS();
    if (users == null) {
      return;
    }
    // clone zeroed quota upgrades, to make sure they're always defined
    const upgrades = copy(ZERO_QUOTAS);
    for (let account_id in users) {
      const info = users[account_id];
      const object = info.upgrades != null ? info.upgrades : {};
      for (let prop in object) {
        const val = object[prop];
        upgrades[prop] = (upgrades[prop] ?? 0) + val;
      }
    }

    return upgrades;
  }

  // in seconds
  public get_idle_timeout(project_id: string): number {
    // mintime = time in seconds project can stay unused
    // (0 is probably wrong but better than this being "undefined".)
    let mintime =
      this.getIn(["project_map", project_id, "settings", "mintime"]) ?? 0;

    // contribution from users
    this.getIn(["project_map", project_id, "users"])?.map((info) => {
      mintime += info?.getIn(["upgrades", "mintime"]) ?? 0;
    });
    // contribution from site license
    const site_license = this.get_total_site_license_upgrades_to_project(
      project_id
    );
    mintime += site_license.mintime;

    return 1000 * mintime;
  }

  // The timestap (in server time) when this project will
  // idle timeout if not edited by anybody.
  public get_idle_timeout_horizon(project_id: string): Date | undefined {
    // time when last edited in server time
    const last_edited = this.getIn(["project_map", project_id, "last_edited"]);

    // It can be undefined, e.g., for admin viewing a project they are not a collab on, since
    // the project isn't in the project_map.  See https://github.com/sagemathinc/cocalc/issues/4686
    // Using right now in that case is a good approximation.
    if (last_edited == null) return;
    const idle_timeout = this.get_idle_timeout(project_id);
    return new Date(last_edited.valueOf() + idle_timeout);
  }

  // Returns the TOTAL of the quotas contributed by all
  // site licenses.  Does not return undefined, even if all
  // contributions are 0.
  public get_total_site_license_upgrades_to_project(
    project_id: string
  ): Upgrades {
    const site_license = this.getIn([
      "project_map",
      project_id,
      "site_license",
    ])?.toJS();
    let upgrades = Object.assign({}, ZERO_QUOTAS);
    if (site_license != null) {
      // contributions from old-format site license contribution
      for (let license_id in site_license) {
        const info = site_license[license_id];
        const object = info != null ? info : {};
        for (let prop in object) {
          const val = object[prop];
          upgrades[prop] = (upgrades[prop] ?? 0) + parseInt(val);
        }
      }
    }
    return upgrades;
  }

  // Return string array of the site licenses that are applied to this project.
  public get_site_license_ids(project_id: string): string[] {
    const site_license: undefined | Map<string, any> = this.getIn([
      "project_map",
      project_id,
      "site_license",
    ]);
    if (site_license == null) {
      return [];
    }
    return keys(site_license.toJS());
  }

  // Get the total quotas for the given project, including free base
  // values, site_license contribution and all user upgrades.
  public get_total_project_quotas(project_id: string): undefined | Upgrades {
    const base_values =
      this.getIn(["project_map", project_id, "settings"])?.toJS() ??
      copy(ZERO_QUOTAS);
    coerce_codomain_to_numbers(base_values);
    const upgrades = this.get_total_project_upgrades(project_id);
    const site_license_upgrades = this.get_total_site_license_upgrades_to_project(
      project_id
    );
    const quota = map_sum(
      map_sum(base_values, upgrades),
      site_license_upgrades
    );
    this.new_format_license_quota(project_id, quota);

    return quota;
  }

  public is_always_running(project_id: string): boolean {
    // always_running can only be in settings (used by admins),
    // or in quota field of some license
    if (this.getIn(["project_map", project_id, "settings", "always_running"])) {
      return true;
    }
    const site_license = this.getIn([
      "project_map",
      project_id,
      "site_license",
    ])?.toJS();
    if (site_license != null) {
      for (const license_id in site_license) {
        if (site_license[license_id]?.quota?.always_running) {
          return true;
        }
      }
    }
    return false;
  }

  // include contribution from new format of quotas for licenses
  private new_format_license_quota(project_id: string, quota): void {
    const site_license = this.getIn([
      "project_map",
      project_id,
      "site_license",
    ])?.toJS();
    if (site_license != null) {
      // TS: using "any" since we add some fields below
      const license_quota: any = site_license_quota(site_license);
      // Some different names/units are used for the frontend quota_console.
      // It makes more sense to add them in here, rather than have confusing
      // redundancy in the site_license_quota function.  Optimally, we would
      // unify everything in the frontend ui and never have two different names
      // and units for the same thing.
      license_quota.cores = license_quota.cpu_limit;
      delete license_quota["cpu_limit"];
      license_quota.memory = license_quota.memory_limit;
      delete license_quota["memory_limit"];
      license_quota.cpu_shares = 1024 * license_quota.cpu_request;
      delete license_quota["cpu_request"];
      max_quota(quota, license_quota);
    }
  }

  // we allow URLs in projects, which have member hosting or internet access
  // this must harmonize with smc-hub/client → mesg_invite_noncloud_collaborators
  public allow_urls_in_emails(project_id: string): boolean {
    const quotas = this.get_total_project_quotas(project_id);
    if (quotas == null) {
      return false;
    } else {
      return !!(quotas.network || quotas.member_host);
    }
  }

  // Return javascript mapping from project_id's to the upgrades
  // for the given projects.
  // Only includes projects with at least one upgrade
  public get_upgraded_projects():
    | { [project_id: string]: Upgrades }
    | undefined {
    if (this.get("project_map") == null) {
      return;
    }
    const v: { [project_id: string]: Upgrades } = {};
    this.get("project_map")?.map((_, project_id) => {
      const upgrades = this.get_upgrades_to_project(project_id);
      if (upgrades != null && len(upgrades) > 0) {
        v[project_id] = upgrades;
      }
    });
    return v;
  }

  // Return javascript mapping from project_id's to the upgrades
  // the user with the given account_id applied to projects.  Only
  // includes projects that they upgraded that you are a collaborator on.
  public get_projects_upgraded_by():
    | undefined
    | { [project_id: string]: Upgrades } {
    if (this.get("project_map") == null) {
      return;
    }
    const { account_id } = webapp_client;
    if (account_id == null) return {};
    const v: { [project_id: string]: Upgrades } = {};
    this.get("project_map")?.map((project, project_id) => {
      const upgrades = project.getIn(["users", account_id, "upgrades"])?.toJS();
      if (upgrades == null) return;
      for (let upgrade in upgrades) {
        const val = upgrades[upgrade];
        if (val > 0) {
          v[project_id] = upgrades;
          break;
        }
      }
    });
    return v;
  }

  public has_internet_access(project_id: string): boolean {
    return has_internet_access(project_id);
  }

  // Returns true if the project should be visible with the specified filters selected
  private project_is_in_filter(
    project_id: string,
    hidden: boolean,
    deleted: boolean
  ): boolean {
    const account_id = webapp_client.account_id;
    const project = this.getIn(["project_map", "project", project_id]);
    return (
      !!project.get("deleted") == deleted &&
      !!project.getIn("users", account_id, "hide") == hidden
    );
  }

  // Returns true if the user has any hidden projects
  public has_hidden_projects(): boolean {
    const project_map = this.get("project_map");
    if (project_map == null) return false;
    for (const [project_id] of project_map) {
      if (
        this.project_is_in_filter(project_id, true, false) ||
        this.project_is_in_filter(project_id, true, true)
      ) {
        return true;
      }
    }
    return false;
  }

  // Returns true if this project has any deleted files
  public has_deleted_projects(): boolean {
    const project_map = this.get("project_map");
    if (project_map == null) return false;
    for (const [project_id] of project_map) {
      if (
        this.project_is_in_filter(project_id, false, true) ||
        this.project_is_in_filter(project_id, true, true)
      ) {
        return true;
      }
    }
    return false;
  }

  public get_projects_with_compute_image(csi: string) {
    const by_csi = (val) => {
      const ci = val.get("compute_image");
      if (ci.startsWith(CUSTOM_IMG_PREFIX)) {
        return ci.split("/")[1] === csi;
      } else {
        return false;
      }
    };
    return this.get("project_map")?.filter(by_csi).valueSeq();
  }
}

// WARNING: A lot of code relies on the assumption project_map is
// undefined until it is loaded from the server.
const init_store = {
  open_projects: List<string>(), // ordered list of open projects

  search: "",
  deleted: false,
  hidden: false,
  selected_hashtags: Map<string, Set<string>>(),

  all_projects_have_been_loaded: false,

  public_project_titles: Map<string, any>(),

  project_websockets: Map<string, WebsocketState>(),
} as ProjectsState;

export const store = redux.createStore("projects", ProjectsStore, init_store);

// Every time a project actions gets created or useRedux(['projects', ...]),
// there is a new listener on the projects store, and there can be
// many projectActions, e.g., when working with a course with 200 students.
store.setMaxListeners(1000);
