/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { TypedMap } from "../app-framework";
import { StudentsMap } from "./store";
import { AssignmentCopyStep } from "./types";
import { separate_file_extension } from "smc-util/misc2";

// Pure functions used in the course manager

// CoCalc libraries
import * as misc from "smc-util/misc";
const { defaults, required } = misc;
import { search_match, search_split } from "smc-util/misc2";

export function STEPS(peer: boolean): AssignmentCopyStep[] {
  if (peer) {
    return [
      "assignment",
      "collect",
      "peer_assignment",
      "peer_collect",
      "return_graded",
    ];
  } else {
    return ["assignment", "collect", "return_graded"];
  }
}

export function previous_step(
  step: AssignmentCopyStep,
  peer: boolean
): AssignmentCopyStep {
  let prev: AssignmentCopyStep | undefined;
  for (const s of STEPS(peer)) {
    if (step === s) {
      if (prev === undefined) break;
      return prev;
    }
    prev = s;
  }
  throw Error(`BUG! previous_step('${step}, ${peer}')`);
}

export function step_direction(step: AssignmentCopyStep): "to" | "from" {
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
      throw Error(`BUG! step_direction('${step}')`);
  }
}

export function step_verb(step: AssignmentCopyStep) {
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
      throw Error(`BUG! step_verb('${step}')`);
  }
}

export function step_ready(step: AssignmentCopyStep, n) {
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
  for (const x of v) {
    if (x.account_id != null) {
      const user = user_map.get(x.account_id);
      if (x.first_name == null) {
        x.first_name = user == null ? "" : user.get("first_name", "");
      }
      if (x.last_name == null) {
        x.last_name = user == null ? "" : user.get("last_name", "");
      }
      if (x.project_id != null) {
        const projects_store = redux.getStore("projects");
        if (projects_store != null) {
          const last_active = projects_store.get_last_active(x.project_id);
          if (last_active != null) {
            x.last_active = last_active.get(x.account_id);
          }
          const upgrades = projects_store.get_total_project_quotas(
            x.project_id
          );
          if (upgrades != null) {
            x.hosting = upgrades.member_host;
          }
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
): T extends TypedMap<infer S>
  ? S[]
  : T extends Map<string, infer S>
  ? S[]
  : any;
export function immutable_to_list(x: any, primary_key?): any {
  if (x == null || x == undefined) {
    return;
  }
  const v: any[] = [];
  x.map((val, key) => v.push(misc.merge(val.toJS(), { [primary_key]: key })));
  return v;
}

// Returns a list of matched objects and the number of objects
// which were in the original list but omitted in the returned list
export function compute_match_list(opts: {
  list: any[];
  search_key: string;
  search: string;
}) {
  opts = defaults(opts, {
    list: required, // list of objects<M>
    search_key: required, // M.search_key property to match over
    search: required, // matches to M.search_key
  });
  let { list, search, search_key } = opts;
  if (!search) {
    // why are you even calling this..
    return { list, num_omitted: 0 };
  }

  const words = search_split(search);
  const matches = (x) =>
    search_match(x[search_key]?.toLowerCase?.() ?? "", words);
  const n = list.length;
  list = list.filter(matches);
  const num_omitted = n - list.length;
  return { list, num_omitted };
}

// Returns
// `list` partitioned into [not deleted, deleted]
// where each partition is sorted based on the given `compare_function`
// deleted is not included by default
export function order_list<T extends { deleted: boolean }>(opts: {
  list: T[];
  compare_function: (a: T, b: T) => number;
  reverse: boolean;
  include_deleted: boolean;
}) {
  opts = defaults(opts, {
    list: required,
    compare_function: required,
    reverse: false,
    include_deleted: false,
  });
  let { list, compare_function, include_deleted } = opts;

  const x = list.filter((x) => x.deleted);
  const sorted_deleted = x.sort(compare_function);

  const y = list.filter((x) => !x.deleted);
  list = y.sort(compare_function);

  if (opts.reverse) {
    list.reverse();
  }

  if (include_deleted) {
    list = list.concat(sorted_deleted);
  }

  return { list, deleted: x, num_deleted: sorted_deleted.length };
}

const sort_on_string_field = (field) => (a, b) =>
  misc.cmp(a[field].toLowerCase(), b[field].toLowerCase());

const sort_on_numerical_field = (field) => (a, b) =>
  misc.cmp(a[field] * -1, b[field] * -1);

export enum StudentField {
  email = "email",
  first_name = "first_name",
  last_name = "last_name",
  last_active = "last_active",
  hosting = "hosting",
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

export function assignment_identifier(
  assignment_id: string,
  student_id: string
): string {
  return assignment_id + student_id;
}

export function autograded_filename(filename: string): string {
  const { name, ext } = separate_file_extension(filename);
  return name + "_autograded." + ext;
}
