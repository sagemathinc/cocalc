import { Map } from "immutable";
import { TypedMap } from "../app-framework/TypedMap";
import { StudentsMap } from "./store";

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
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

// Pure functions used in the course manager

// CoCalc libraries
const misc = require("smc-util/misc");
const { defaults, required } = misc;

export enum Step {
  assignment = "assignment",
  collect = "collect",
  peer_assignment = "peer_assignment",
  peer_collect = "peer_collect",
  return_graded = "return_graded"
}

export function STEPS(peer: boolean) {
  if (peer) {
    return [
      Step.assignment,
      Step.collect,
      Step.peer_assignment,
      Step.peer_collect,
      Step.return_graded
    ];
  } else {
    return [Step.assignment, Step.collect, Step.return_graded];
  }
}

// Returns undefined if no previous step
export function previous_step(step: Step, peer: boolean): Step | undefined {
  let prev: Step | undefined;
  for (let s of STEPS(peer)) {
    if (step === s) {
      return prev;
    }
    prev = s;
  }
  console.warn(`BUG! previous_step('${step}, ${peer}')`);
  return undefined;
}

export function step_direction(step: Step) {
  switch (step) {
    case "assignment":
      return "to";
    case "collect":
      return "from";
    case "return_graded":
      return "to";
    case "peer_assignment":
      return "to";
    case "peer_collect":
      return "from";
    default:
      return console.warn(`BUG! step_direction('${step}')`);
  }
}

export function step_verb(step: Step) {
  switch (step) {
    case "assignment":
      return "assign";
    case "collect":
      return "collect";
    case "return_graded":
      return "return";
    case "peer_assignment":
      return "assign";
    case "peer_collect":
      return "collect";
    default:
      return console.warn(`BUG! step_verb('${step}')`);
  }
}

export function step_ready(step: Step, n) {
  switch (step) {
    case "assignment":
      return "";
    case "collect":
      if (n > 1) {
        return " who have already received it";
      } else {
        return " who has already received it";
      }
    case "return_graded":
      return " whose work you have graded";
    case "peer_assignment":
      return " for peer grading";
    case "peer_collect":
      return " who should have peer graded it";
  }
}

// Takes a student immutable.Map with key 'student_id'
// Returns a list of students `x` shaped like:
// {
//    first_name    : string
//    last_name     : string
//    last_active   : integer
//    hosting       : bool
//    email_address : string
// }
export function parse_students(student_map: StudentsMap, user_map, redux) {
  const v = immutable_to_list(student_map, "student_id");
  for (var x of v) {
    if (x.account_id != null) {
      const user = user_map.get(x.account_id);
      if (x.first_name == null) {
        var left;
        x.first_name =
          (left = user != null ? user.get("first_name") : undefined) != null
            ? left
            : "";
      }
      if (x.last_name == null) {
        var left1;
        x.last_name =
          (left1 = user != null ? user.get("last_name") : undefined) != null
            ? left1
            : "";
      }
      if (x.project_id != null) {
        x.last_active = __guardMethod__(
          __guard__(
            redux.getStore("projects").get_last_active(x.project_id),
            x1 => x1.get(x.account_id)
          ),
          "getTime",
          o => o.getTime()
        );
        const upgrades = redux
          .getStore("projects")
          .get_total_project_quotas(x.project_id);
        if (upgrades != null) {
          x.hosting = upgrades.member_host;
        }
      }
    }

    if (x.first_name == null) {
      x.first_name = "";
    }
    if (x.last_name == null) {
      x.last_name = "";
    }
    if (x.last_active == null) {
      x.last_active = 0;
    }
    if (x.hosting == null) {
      x.hosting = false;
    }
    if (x.email_address == null) {
      x.email_address = "";
    }
  }
  return v;
}

// Transforms Iterable<K, M<i, m>> to [M<i + primary_key, m + K>] where primary_key maps to K
// Dunno if either of these is readable...
// Turns Map(Keys -> Objects{...}) into [Objects{primary_key : Key, ...}]
// TODO: Type return array better
export function immutable_to_list(x: undefined): undefined;
export function immutable_to_list<T, P>(
  x: Map<string, T>,
  primary_key: P
): T extends TypedMap<infer S> ? S[] : T extends Map<string, infer S> ? S[] : any;
export function immutable_to_list(x: any, primary_key?): any {
  if (x == null || x == undefined) {
    return;
  }
  const v: any[] = [];
  x.map((val, key) => v.push(misc.merge(val.toJS(), { [primary_key]: key })));
  return v;
}
Object.assign
// Returns a list of matched objects and the number of objects
// which were in the original list but omitted in the returned list
export function compute_match_list(opts) {
  opts = defaults(opts, {
    list: required, // list of objects<M>
    search_key: required, // M.search_key property to match over
    search: required, // matches to M.search_key
    ignore_case: true
  });
  let { list, search, search_key, ignore_case } = opts;
  if (!search) {
    // why are you even calling this..
    return { list, num_omitted: 0 };
  }

  let num_omitted = 0;
  const words = misc.split(search);
  const matches = x => {
    let k;
    if (ignore_case) {
      k =
        typeof x[search_key].toLowerCase === "function"
          ? x[search_key].toLowerCase()
          : undefined;
    } else {
      k = x[search_key];
    }
    for (let w of words) {
      if (k.indexOf(w) === -1) {
        // no match
        num_omitted += 1;
        return false;
      }
    }
    return true;
  };
  list = list.filter(matches);
  return { list, num_omitted };
}

// Returns
// `list` partitioned into [not deleted, deleted]
// where each partition is sorted based on the given `compare_function`
// deleted is not included by default
export function order_list<T extends { deleted: boolean }>(opts: {
  list: T[];
  compare_function: (a: T, b: T) => 1 | -1 | 0;
  reverse: boolean;
  include_deleted: boolean;
}) {
  opts = defaults(opts, {
    list: required,
    compare_function: required,
    reverse: false,
    include_deleted: false
  });
  let { list, compare_function, include_deleted } = opts;

  const x = list.filter(x => x.deleted);
  const sorted_deleted = x.sort(compare_function);

  const y = list.filter(x => !x.deleted);
  list = y.sort(compare_function);

  if (opts.reverse) {
    list.reverse();
  }

  if (include_deleted) {
    list = list.concat(sorted_deleted);
  }

  return { list, deleted: x, num_deleted: sorted_deleted.length };
}

const sort_on_string_field = field => (a, b) =>
  misc.cmp(a[field].toLowerCase(), b[field].toLowerCase());

const sort_on_numerical_field = field => (a, b) =>
  misc.cmp(a[field] * -1, b[field] * -1);


export enum StudentField {
  email = "email",
  first_name = "first_name",
  last_name = "last_name",
  last_active = "last_active",
  hosting = "hosting"
}

export function pick_student_sorter<T extends { column_name: StudentField }>(
  sort: T
) {
  switch (sort.column_name) {
    case "email":
      return sort_on_string_field("email_address");
    case "first_name":
      return sort_on_string_field("first_name");
    case "last_name":
      return sort_on_string_field("last_name");
    case "last_active":
      return sort_on_numerical_field("last_active");
    case "hosting":
      return sort_on_numerical_field("hosting");
  }
}

function __guardMethod__(obj, methodName, transform) {
  if (
    typeof obj !== "undefined" &&
    obj !== null &&
    typeof obj[methodName] === "function"
  ) {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}
function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
