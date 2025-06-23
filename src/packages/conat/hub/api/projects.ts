import { authFirstRequireAccount } from "./util";
import { type CreateProjectOptions } from "@cocalc/util/db-schema/projects";
import { type UserCopyOptions } from "@cocalc/util/db-schema/projects";

export const projects = {
  createProject: authFirstRequireAccount,
  copyPathBetweenProjects: authFirstRequireAccount,
  removeCollaborator: authFirstRequireAccount,
  addCollaborator: authFirstRequireAccount,
  inviteCollaborator: authFirstRequireAccount,
  inviteCollaboratorWithoutAccount: authFirstRequireAccount,
  setQuotas: authFirstRequireAccount,
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

  copyPathBetweenProjects: (opts: UserCopyOptions) => Promise<void>;

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
}
