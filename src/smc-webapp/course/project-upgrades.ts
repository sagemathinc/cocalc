import { Map } from "immutable";

/*
 * decaffeinate suggestions:
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Functions for determining various things about applying upgrades to a project.

WARNING: Pure Javascript with no crazy dependencies for easy unit testing.
*/

const misc = require("smc-util/misc");

type ProjectMap = Map<any, any>;
interface ExistenceMap {
  [keys: string]: boolean;
}

export function available_upgrades(opts: {
  account_id: string; // id of a user
  purchased_upgrades: object; // map of the total upgrades purchased by account_id
  project_map: ProjectMap; // immutable.js map of data about projects
  student_project_ids: ExistenceMap; // map project_id:true with keys *all* student
  // projects in course, including deleted
}) {
  /*
    Return the total upgrades that the user with given account_id has to apply
    toward this course.   This is all upgrades they have purchased minus
    upgrades they have applied to projects that aren't student projects in
    this course.  Thus this is what they have available to distribute to
    their students in this course.

    This is a map {quota0:x, quota1:y, ...}
    */
  let available = misc.copy(opts.purchased_upgrades);
  opts.project_map.forEach(function(project, project_id) {
    if (opts.student_project_ids[project_id]) {
      // do not count projects in course
      return;
    }
    const upgrades = __guard__(
      project.getIn(["users", opts.account_id, "upgrades"]),
      x => x.toJS()
    );
    if (upgrades != null) {
      available = misc.map_diff(available, upgrades);
    }
  });
  return available;
}

export function current_student_project_upgrades(opts: {
  account_id: string; // id of a user
  project_map: ProjectMap; // immutable.js map of data about projects
  student_project_ids: ExistenceMap; // map project_id:true with keys *all* student
}) {
  /*
    Return the total upgrades currently applied to each student project from
    everybody else except the user with given account_id.

    This output is a map {project_id:{quota0:x, quota1:y, ...}, ...}; only projects with
    actual upgrades are included.
    */
  const other = {};
  for (let project_id in opts.student_project_ids) {
    const users = opts.project_map.getIn([project_id, "users"]);
    if (users == null) {
      continue;
    }
    var x = undefined;
    users.forEach(function(info, user_id) {
      if (user_id === opts.account_id) {
        return;
      }
      const upgrades = __guard__(info.get("upgrades"), x1 => x1.toJS());
      if (upgrades == null) {
        return;
      }
      x = misc.map_sum(upgrades, x != null ? x : {});
    });
    if (x != null) {
      other[project_id] = x;
    }
  }
  return other;
}

export function upgrade_plan(opts: {
  account_id: string; // id of a user
  purchased_upgrades: object; // map of the total upgrades purchased by account_id
  project_map: ProjectMap; // immutable.js map of data about projects
  student_project_ids: ExistenceMap; // map project_id:true with keys *all* student
  //                                    projects in course, including deleted
  deleted_project_ids: ExistenceMap; // map project_id:true just for projects where
  //                                    student is considered deleted from class
  upgrade_goal: object; // [quota0:x, quota1:y]
}) {
  /*
    Determine what upgrades should be applied by this user to get
    the student projects to the given upgrade goal.  Preference
    is by project_id in order (arbitrary, but stable).

    The output is a map {student_project_id:{quota0:x, quota1:y, ...}, ...}, where the quota0:x means
    that account_id will apply x amount of quota0 total.  Thus to actually *do* the upgrading,
    this user (account_id) would go through the project map and set their upgrade contribution
    for the student projects in this course to exactly what is specified by this function.
    Note that no upgrade quota will be deducted from projects outside this course to satisfy
    the upgrade_goal.

    If a student_project_id is missing from the output the contribution is 0; if a quota is
    missing, the contribution is 0.

    The keys of the output map are **exactly** the ids of the projects where the current
    allocation should be *changed*.   That said, we only consider quotas explicitly given
    in the upgrade_goal map.
    */
  // upgrades, etc., that student projects already have (which account_id did not provide)
  const cur = exports.current_student_project_upgrades({
    account_id: opts.account_id,
    project_map: opts.project_map,
    student_project_ids: opts.student_project_ids
  });

  // upgrades we have that have not been allocated to our course
  const available = exports.available_upgrades({
    account_id: opts.account_id,
    purchased_upgrades: opts.purchased_upgrades,
    project_map: opts.project_map,
    student_project_ids: opts.student_project_ids
  });

  const ids = misc.keys(opts.student_project_ids);
  ids.sort();
  const plan = {};
  for (let project_id of ids) {
    var left;
    if (opts.deleted_project_ids[project_id]) {
      // give this project NOTHING
      continue;
    }
    plan[project_id] = {};
    // we only care about quotas in the upgrade_goal
    for (var quota in opts.upgrade_goal) {
      const val = opts.upgrade_goal[quota];
      const need =
        val -
        ((cur[project_id] != null ? cur[project_id][quota] : undefined) != null
          ? cur[project_id] != null
            ? cur[project_id][quota]
            : undefined
          : 0);
      if (need > 0) {
        const have = Math.min(need, available[quota]);
        plan[project_id][quota] = have;
        available[quota] -= have;
      }
    }
    // is there an actual allocation change?  if not, we do not include this key.
    const alloc =
      (left = __guard__(
        opts.project_map.getIn([
          project_id,
          "users",
          opts.account_id,
          "upgrades"
        ]),
        x => x.toJS()
      )) != null
        ? left
        : {};
    let change = false;
    for (quota in opts.upgrade_goal) {
      if (
        (alloc[quota] != null ? alloc[quota] : 0) !==
        (plan[project_id][quota] != null ? plan[project_id][quota] : 0)
      ) {
        change = true;
        break;
      }
    }
    if (!change) {
      delete plan[project_id];
    }
  }
  return plan;
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
