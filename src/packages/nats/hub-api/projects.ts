import { authFirstRequireAccount } from "./util";
import { type CreateProjectOptions } from "@cocalc/util/db-schema/projects";

export const projects = {
  addProjectPermission: authFirstRequireAccount,
  createProject: authFirstRequireAccount,
};

export interface Projects {
  // request to have NATS permissions to project subjects.
  addProjectPermission: (opts: { project_id: string }) => Promise<void>;
  createProject: (opts: CreateProjectOptions) => Promise<string>;
}
