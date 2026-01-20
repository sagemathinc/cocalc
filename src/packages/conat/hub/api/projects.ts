import { authFirstRequireAccount, authFirstRequireProject } from "./util";
import { type CreateProjectOptions } from "@cocalc/util/db-schema/projects";
import { type SnapshotCounts } from "@cocalc/util/consts/snapshots";
import { type CopyOptions } from "@cocalc/conat/files/fs";
import {
  type FileTextPreview,
  type SnapshotUsage,
  type RestoreMode,
  type RestoreStagingHandle,
} from "@cocalc/conat/files/file-server";

export type ProjectCopyState =
  | "queued"
  | "applying"
  | "done"
  | "failed"
  | "canceled"
  | "expired";

export interface ProjectCopyRow {
  src_project_id: string;
  src_path: string;
  dest_project_id: string;
  dest_path: string;
  op_id: string | null;
  snapshot_id: string;
  options: CopyOptions | null;
  status: ProjectCopyState;
  last_error: string | null;
  attempt: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  last_attempt_at: Date | null;
}

export interface BackupFindResult {
  id: string;
  time: Date;
  path: string;
  isDir: boolean;
  mtime: number;
  size: number;
}

export const projects = {
  createProject: authFirstRequireAccount,
  copyPathBetweenProjects: authFirstRequireAccount,
  listPendingCopies: authFirstRequireAccount,
  cancelPendingCopy: authFirstRequireAccount,
  removeCollaborator: authFirstRequireAccount,
  addCollaborator: authFirstRequireAccount,
  inviteCollaborator: authFirstRequireAccount,
  inviteCollaboratorWithoutAccount: authFirstRequireAccount,
  setQuotas: authFirstRequireAccount,

  getDiskQuota: authFirstRequireAccount,

  createBackup: authFirstRequireAccount,
  deleteBackup: authFirstRequireAccount,
  restoreBackup: authFirstRequireAccount,
  beginRestoreStaging: authFirstRequireAccount,
  ensureRestoreStaging: authFirstRequireAccount,
  finalizeRestoreStaging: authFirstRequireAccount,
  releaseRestoreStaging: authFirstRequireAccount,
  cleanupRestoreStaging: authFirstRequireAccount,
  updateBackups: authFirstRequireAccount,
  getBackups: authFirstRequireAccount,
  getBackupFiles: authFirstRequireAccount,
  findBackupFiles: authFirstRequireAccount,
  getBackupFileText: authFirstRequireAccount,
  getBackupQuota: authFirstRequireAccount,

  createSnapshot: authFirstRequireAccount,
  deleteSnapshot: authFirstRequireAccount,
  updateSnapshots: authFirstRequireAccount,
  getSnapshotQuota: authFirstRequireAccount,
  allSnapshotUsage: authFirstRequireAccount,
  getSnapshotFileText: authFirstRequireAccount,

  start: authFirstRequireAccount,
  stop: authFirstRequireAccount,
  updateAuthorizedKeysOnHost: authFirstRequireAccount,

  getSshKeys: authFirstRequireProject,

  moveProject: authFirstRequireAccount,
};

export type AddCollaborator =
  | {
      project_id: string;
      account_id: string;
      token_id?: undefined;
    }
  | {
      token_id: string;
      account_id: string;
      project_id?: undefined;
    }
  | { project_id: string[]; account_id: string[]; token_id?: undefined } // for adding more than one at once
  | { account_id: string[]; token_id: string[]; project_id?: undefined };

export interface Projects {
  // request to have conat permissions to project subjects.
  createProject: (opts: CreateProjectOptions) => Promise<string>;

  copyPathBetweenProjects: (opts: {
    src: { project_id: string; path: string | string[] };
    dest: { project_id: string; path: string };
    options?: CopyOptions;
  }) => Promise<{
    op_id: string;
    scope_type: "project";
    scope_id: string;
    service: string;
    stream_name: string;
  }>;

  listPendingCopies: (opts: {
    account_id?: string;
    project_id: string;
    include_completed?: boolean;
  }) => Promise<ProjectCopyRow[]>;

  cancelPendingCopy: (opts: {
    account_id?: string;
    src_project_id: string;
    src_path: string;
    dest_project_id: string;
    dest_path: string;
  }) => Promise<void>;

  removeCollaborator: ({
    account_id,
    opts,
  }: {
    account_id?: string;
    opts: {
      account_id;
      project_id;
    };
  }) => Promise<void>;

  addCollaborator: ({
    account_id,
    opts,
  }: {
    account_id?: string;
    opts: AddCollaborator;
  }) => Promise<{ project_id?: string | string[] }>;

  inviteCollaborator: ({
    account_id,
    opts,
  }: {
    account_id?: string;
    opts: {
      project_id: string;
      account_id: string;
      title?: string;
      link2proj?: string;
      replyto?: string;
      replyto_name?: string;
      email?: string;
      subject?: string;
    };
  }) => Promise<void>;

  inviteCollaboratorWithoutAccount: ({
    account_id,
    opts,
  }: {
    account_id?: string;
    opts: {
      project_id: string;
      title: string;
      link2proj: string;
      replyto?: string;
      replyto_name?: string;
      to: string;
      email: string; // body in HTML format
      subject?: string;
    };
  }) => Promise<void>;

  // for admins only!
  setQuotas: (opts: {
    account_id?: string;
    project_id: string;
    memory?: number;
    memory_request?: number;
    cpu_shares?: number;
    cores?: number;
    disk_quota?: number;
    mintime?: number;
    network?: number;
    member_host?: number;
    always_running?: number;
  }) => Promise<void>;

  getDiskQuota: (opts: {
    account_id?: string;
    project_id: string;
  }) => Promise<{ used: number; size: number }>;

  /////////////
  // BACKUPS
  /////////////
  createBackup: (opts: {
    account_id?: string;
    project_id: string;
  }) => Promise<{
    op_id: string;
    scope_type: "project";
    scope_id: string;
    service: string;
    stream_name: string;
  }>;

  deleteBackup: (opts: {
    account_id?: string;
    project_id: string;
    id: string;
  }) => Promise<void>;

  restoreBackup: (opts: {
    account_id?: string;
    project_id: string;
    path?: string;
    dest?: string;
    id: string;
  }) => Promise<{
    op_id: string;
    scope_type: "project";
    scope_id: string;
    service: string;
    stream_name: string;
  }>;

  beginRestoreStaging: (opts: {
    account_id?: string;
    project_id: string;
    home?: string;
    restore?: RestoreMode;
  }) => Promise<RestoreStagingHandle | null>;

  ensureRestoreStaging: (opts: {
    account_id?: string;
    handle: RestoreStagingHandle;
  }) => Promise<void>;

  finalizeRestoreStaging: (opts: {
    account_id?: string;
    handle: RestoreStagingHandle;
  }) => Promise<void>;

  releaseRestoreStaging: (opts: {
    account_id?: string;
    handle: RestoreStagingHandle;
    cleanupStaging?: boolean;
  }) => Promise<void>;

  cleanupRestoreStaging: (opts: {
    account_id?: string;
    project_id: string;
    root?: string;
  }) => Promise<void>;

  updateBackups: (opts: {
    account_id?: string;
    project_id: string;
    counts?: Partial<SnapshotCounts>;
  }) => Promise<void>;

  getBackups: (opts: {
    account_id?: string;
    project_id: string;
    indexed_only?: boolean;
  }) => Promise<
    {
      id: string;
      time: Date;
      summary: { [key: string]: string | number };
    }[]
  >;

  getBackupFiles: (opts: {
    account_id?: string;
    project_id: string;
    id: string;
    path?: string;
  }) => Promise<
    { name: string; isDir: boolean; mtime: number; size: number }[]
  >;

  findBackupFiles: (opts: {
    account_id?: string;
    project_id: string;
    glob?: string[];
    iglob?: string[];
    path?: string;
    ids?: string[];
  }) => Promise<BackupFindResult[]>;

  getBackupFileText: (opts: {
    account_id?: string;
    project_id: string;
    id: string;
    path: string;
    max_bytes?: number;
  }) => Promise<FileTextPreview>;

  getBackupQuota: (opts: {
    account_id?: string;
    project_id: string;
  }) => Promise<{ limit: number }>;

  /////////////
  // SNAPSHOTS
  /////////////

  createSnapshot: (opts: {
    account_id?: string;
    project_id: string;
    name?: string;
  }) => Promise<void>;

  deleteSnapshot: (opts: {
    account_id?: string;
    project_id: string;
    name: string;
  }) => Promise<void>;

  updateSnapshots: (opts: {
    account_id?: string;
    project_id: string;
    counts?: Partial<SnapshotCounts>;
  }) => Promise<void>;

  getSnapshotQuota: (opts: {
    account_id?: string;
    project_id: string;
  }) => Promise<{ limit: number }>;

  allSnapshotUsage: (opts: { project_id: string }) => Promise<SnapshotUsage[]>;

  getSnapshotFileText: (opts: {
    account_id?: string;
    project_id: string;
    snapshot: string;
    path: string;
    max_bytes?: number;
  }) => Promise<FileTextPreview>;

  /////////////
  // Project Control
  /////////////
  start: (opts: {
    account_id?: string;
    project_id: string;
    authorized_keys?: string;
    run_quota?: any;
    image?: string;
    restore?: "none" | "auto" | "required";
    lro_op_id?: string;
    // When false, enqueue start and return immediately; callers can watch
    // LRO/changefeed for progress.
    wait?: boolean;
  }) => Promise<{
    op_id: string;
    scope_type: "project";
    scope_id: string;
    service: string;
    stream_name: string;
  }>;
  stop: (opts: { account_id?: string; project_id: string }) => Promise<void>;
  updateAuthorizedKeysOnHost: (opts: {
    project_id: string;
    account_id?: string;
  }) => Promise<void>;

  // get a list if all public ssh authorized keys that apply to
  // the given project.
  // this is ALL global public keys for all collabs on the project,
  // along with all project specific keys. This is called by the project
  // on startup to configure itself.
  getSshKeys: (opts?: { project_id?: string }) => Promise<string[]>;

  moveProject: (opts: {
    account_id?: string;
    project_id: string;
    dest_host_id?: string;
    allow_offline?: boolean;
  }) => Promise<{
    op_id: string;
    scope_type: "project";
    scope_id: string;
    service: string;
    stream_name: string;
  }>;
}
