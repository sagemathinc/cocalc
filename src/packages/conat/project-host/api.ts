import type { Client } from "@cocalc/conat/core/client";
import {
  createServiceClient,
  createServiceHandler,
} from "@cocalc/conat/service/typed";
import type { ConatService } from "@cocalc/conat/service/typed";
import type {
  CreateProjectOptions,
  ProjectState,
} from "@cocalc/util/db-schema/projects";

export interface HostCreateProjectRequest extends CreateProjectOptions {
  project_id?: string;
  start?: boolean;
}

export interface HostCreateProjectResponse {
  project_id: string;
  state?: ProjectState | string;
}

export interface HostControlApi {
  createProject: (
    opts: HostCreateProjectRequest,
  ) => Promise<HostCreateProjectResponse>;
  startProject: (opts: { project_id: string }) => Promise<HostCreateProjectResponse>;
  stopProject: (opts: { project_id: string }) => Promise<HostCreateProjectResponse>;
  // Later: updateProject to adjust title/users/etc.
}

function subjectForHost(host_id: string): string {
  return `project-host.${host_id}.api`;
}

export function createHostControlClient({
  host_id,
  client,
}: {
  host_id: string;
  client: Client;
}): HostControlApi {
  return createServiceClient<HostControlApi>({
    service: "project-host",
    subject: subjectForHost(host_id),
    client,
  });
}

export function createHostControlService({
  host_id,
  client,
  impl,
}: {
  host_id: string;
  client: Client;
  impl: HostControlApi;
}): ConatService {
  return createServiceHandler<HostControlApi>({
    service: "project-host",
    subject: subjectForHost(host_id),
    description: "Control plane for project-host instance",
    client,
    impl,
  });
}
