import { authFirstRequireAccount, authFirstRequireProject } from "./util";
import { type CreateProjectOptions } from "@cocalc/util/db-schema/projects";
import { type SnapshotCounts } from "@cocalc/util/consts/snapshots";
import { type CopyOptions } from "@cocalc/conat/files/fs";
import { type SnapshotUsage } from "@cocalc/conat/files/file-server";

export const projects = {
  createProject: authFirstRequireAccount,
  copyPathBetweenProjects: authFirstRequireAccount,
  removeCollaborator: authFirstRequireAccount,
  addCollaborator: authFirstRequireAccount,
  inviteCollaborator: authFirstRequireAccount,
  inviteCollaboratorWithoutAccount: authFirstRequireAccount,
  setQuotas: authFirstRequireAccount,

  getDiskQuota: authFirstRequireAccount,

  createBackup: authFirstRequireAccount,
  deleteBackup: authFirstRequireAccount,
  restoreBackup: authFirstRequireAccount,
  updateBackups: authFirstRequireAccount,
  getBackups: authFirstRequireAccount,
  getBackupFiles: authFirstRequireAccount,
  getBackupQuota: authFirstRequireAccount,

  createSnapshot: authFirstRequireAccount,
  deleteSnapshot: authFirstRequireAccount,
  updateSnapshots: authFirstRequireAccount,
  getSnapshotQuota: authFirstRequireAccount,
  allSnapshotUsage: authFirstRequireAccount,

  start: authFirstRequireAccount,
  stop: authFirstRequireAccount,

  getSshKeys: authFirstRequireProject,
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
    compute_server_id?: number;
  }) => Promise<{ used: number; size: number }>;

  /////////////
  // BACKUPS
  /////////////
  createBackup: (opts: {
    account_id?: string;
    project_id: string;
  }) => Promise<{ time: Date; id: string }>;

  deleteBackup: (opts: {
    account_id?: string;
    project_id: string;
    id: string;
  }) => Promise<void>;

  restoreBackup: (opts: {
    account_id?: string;
    project_id: string;
    path?: string;
    id: string;
  }) => Promise<void>;

  updateBackups: (opts: {
    account_id?: string;
    project_id: string;
    counts?: Partial<SnapshotCounts>;
  }) => Promise<void>;

  getBackups: (opts: { account_id?: string; project_id: string }) => Promise<
    {
      id: string;
      time: Date;
    }[]
  >;

  getBackupFiles: (opts: {
    account_id?: string;
    project_id: string;
  }) => Promise<string[]>;

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

  /////////////
  // Project Control
  /////////////
  start: (opts: { account_id: string; project_id: string }) => Promise<void>;
  stop: (opts: { account_id: string; project_id: string }) => Promise<void>;

  // get a list if all public ssh authorized keys that apply to
  // the given project.
  // this is ALL global public keys for all collabs on the project,
  // along with all project specific keys. This is called by the project
  // on startup to configure itself.
  getSshKeys: (opts?: { project_id?: string }) => Promise<string[]>;
}
