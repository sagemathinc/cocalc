export interface SyncDBRecordBase {
  table: string;
}

export interface SyncDBRecordSettings {
  upgrade_goal?: object;
  allow_collabs?: boolean;
  shared_project_id?: string;
  pay?: string;
}

export interface SyncDBRecordAssignment {
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
  status?: { [string_id: string]: { start?: number } };
}

export interface SyncDBRecordHandout {
  handout_id?: string;
  note?: string;
  description?: string;
  title?: string;
  deleted?: boolean;
}

export interface SyncDBRecordStudent {
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
