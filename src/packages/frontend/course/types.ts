/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { DirectoryListingEntry } from "@cocalc/util/types";
import { NotebookScores } from "../jupyter/nbgrader/autograde";
import { Datastore, EnvVars } from "../projects/actions";
import { StudentProjectFunctionality } from "./configuration/customize-student-project-functionality";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import type {
  CopyConfigurationOptions,
  CopyConfigurationTargets,
} from "./configuration/configuration-copying";
import type { AssignmentLocation } from "./store";

export interface SyncDBRecordBase {
  table: string;
}

export type SiteLicenseStrategy = "serial" | "parallel";

export interface SyncDBRecordSettings {
  table: string;
  upgrade_goal?: UpgradeGoal;
  allow_collabs?: boolean;
  mirror_config?: boolean;
  mirror_config_path?: string;
  student_project_functionality?: StudentProjectFunctionality;
  shared_project_id?: string;
  pay?: string;
  payInfo?: PurchaseInfo;
  site_license_id?: string;
  site_license_removed?: string;
  site_license_strategy?: SiteLicenseStrategy;
  copy_parallel?: number; // how many assignments to copy at once in parallel when assigning/collecting/returning
  nbgrader_grade_in_instructor_project?: boolean; // deprecated
  nbgrader_grade_project?: string;
  nbgrader_include_hidden_tests?: boolean;
  nbgrader_cell_timeout_ms?: number;
  nbgrader_timeout_ms?: number;
  nbgrader_max_output?: number;
  nbgrader_max_output_per_cell?: number;
  nbgrader_parallel?: number; // how many students to grade in parallel
  custom_image?: string; // if falsy use default environment; if true-ish, use this software image for student projects. it should be called compute_image or software_image
  inherit_compute_image?: boolean; // if true (default), set the compute_image of student projects to the one of the project hosting the course
  datastore?: Datastore;
  envvars?: EnvVars;
  license_upgrade_host_project?: boolean;
  copy_config_targets?: CopyConfigurationTargets;
  copy_config_options?: CopyConfigurationOptions;
}

// This is closely related to store.AssignmentRecord...

export interface SyncDBRecordAssignment {
  table: string;
  assignment_id?: string;
  note?: string;
  has_student_subdir?: boolean; // True if assignment has a STUDENT_SUBDIR subdir (so only that subdir is sent to students)
  listing?: DirectoryListingEntry[];
  nbgrader?: boolean; // Very likely to be using nbgrader for this assignment (heuristic: existence of foo.ipynb and student/foo.ipynb)
  description?: string;
  title?: string;
  location?: AssignmentLocation;
  exam_projects?: { [student_id: string]: string };
  group_projects?: { [group: string]: string };

  groups?: { [student_id: string]: string };
  grades?: { [student_id: string]: string };
  comments?: { [student_id: string]: string };
  nbgrader_scores?: {
    [student_id: string]: { [ipynb: string]: NotebookScores | string };
  };
  // nbgrader_score_ids are used entirely to determine the order of output when displaying the
  // student scores to the instructor in the course assignments panel. They are extracted from
  // the ipynb file.
  nbgrader_score_ids?: { [ipynb: string]: string[] };
  deleted?: boolean;
  path?: string;
  collect_path?: string;
  graded_path?: string;
  target_path?: string;
  status?: {
    [student_id: string]: { start?: number; time?: number; error?: string };
  };
}

export interface SyncDBRecordHandout {
  table: string;
  handout_id?: string;
  note?: string;
  description?: string;
  title?: string;
  path?: string;
  deleted?: boolean;
  status?: {
    [student_id: string]: { start?: number; time?: number; error?: string };
  };
}

export interface SyncDBRecordStudent {
  table: string;
  student_id?: string;
  account_id?: string;
  email_invite?: string;
  deleted?: boolean;
  deleted_account?: boolean;
  first_name?: string;
  last_name?: string;
  email_address?: string;
  project_id?: string | null;
  last_email_invite?: number;
  create_project?: number | null; // null actually used to delete.
}

export type SyncDBRecord = SyncDBRecordBase &
  SyncDBRecordSettings &
  SyncDBRecordAssignment &
  SyncDBRecordHandout &
  SyncDBRecordStudent;

export type AssignmentCopyStep =
  | "assignment"
  | "collect"
  | "peer_assignment"
  | "peer_collect"
  | "return_graded";

export type LastAssignmentCopyType =
  | "last_collect"
  | "last_return_graded"
  | "last_assignment"
  | "last_peer_assignment"
  | "last_peer_collect";

export type AssignmentCopyType =
  | "assigned"
  | "collected"
  | "graded"
  | "peer-assigned"
  | "peer-collected";

export function copy_type_to_last(
  type: AssignmentCopyType,
): LastAssignmentCopyType {
  switch (type) {
    case "assigned":
      return "last_assignment";
    case "collected":
      return "last_collect";
    case "graded":
      return "last_return_graded";
    case "peer-assigned":
      return "last_peer_assignment";
    case "peer-collected":
      return "last_peer_collect";
  }
  throw Error("type error"); // should be unreachable.
}

export interface UpgradeGoal {
  network?: 0 | 1;
  member_host?: 0 | 1;
  disk_quota?: number;
  cores?: number;
  cpu_shares?: number;
  memory_request?: number;
  mintime?: number;
  memory?: number;
}

export interface AssignmentStatus {
  assignment: number;
  collect: number;
  peer_assignment: number;
  peer_collect: number;
  return_graded: number;
  not_assignment: number;
  not_collect: number;
  not_peer_assignment: number;
  not_peer_collect: number;
  not_return_graded: number;
}
