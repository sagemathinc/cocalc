import { authFirstRequireAccount } from "./util";
import { type CreateProjectOptions } from "@cocalc/util/db-schema/projects";
import { type UserCopyOptions } from "@cocalc/util/db-schema/projects";

export const projects = {
  createProject: authFirstRequireAccount,
  copyPathBetweenProjects: authFirstRequireAccount,
};

export interface Projects {
  // request to have NATS permissions to project subjects.
  createProject: (opts: CreateProjectOptions) => Promise<string>;
  copyPathBetweenProjects: (opts: UserCopyOptions) => Promise<void>;
}
