export interface SyncDBRecordBase {
  table: string;
}

export interface SyncDBRecordSettings {
  table: string;
  upgrade_goal?: UpgradeGoal;
  allow_collabs?: boolean;
  shared_project_id?: string;
  pay?: string;
}

export interface SyncDBRecordAssignment {
  table: string;
  assignment_id?: string;
  note?: string;
  description?: string;
  title?: string;
  grades?: { [student_id: string]: string };
  comments?: { [student_id: string]: string };
  deleted?: boolean;
  path?: string;
  collect_path?: string;
  graded_path?: string;
  target_path?: string;
  status?: {
    [string_id: string]: { start?: number; time?: number; error?: string };
  };
}

export interface SyncDBRecordHandout {
  table: string;
  handout_id?: string;
  note?: string;
  description?: string;
  title?: string;
  deleted?: boolean;
  status?: {
    [string_id: string]: { start?: number; time?: number; error?: string };
  };
}

export interface SyncDBRecordStudent {
  table: string;
  student_id?: string;
  account_id?: string;
  email_invite?: string;
  deleted?: boolean;
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
  type: AssignmentCopyType
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
