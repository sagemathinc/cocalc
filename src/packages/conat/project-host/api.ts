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
  users?: any;
  authorized_keys?: string;
}

export interface HostCreateProjectResponse {
  project_id: string;
  state?: ProjectState | string;
}

export interface HostControlApi {
  createProject: (
    opts: HostCreateProjectRequest,
  ) => Promise<HostCreateProjectResponse>;
  startProject: (opts: {
    project_id: string;
    authorized_keys?: string;
  }) => Promise<HostCreateProjectResponse>;
  stopProject: (opts: { project_id: string }) => Promise<HostCreateProjectResponse>;
  updateAuthorizedKeys: (opts: {
    project_id: string;
    authorized_keys?: string;
  }) => Promise<void>;
  // Later: updateProject to adjust title/users/etc.
}

function subjectForHost(host_id: string): string {
  return `project-host.${host_id}.api`;
}

const STATUS_SUBJECT = "project-hosts.status";

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

export interface HostProjectStatus {
  host_id: string;
  project_id: string;
  state: ProjectState | string;
  host?: {
    public_url?: string;
    internal_url?: string;
    ssh_server?: string;
  };
}

export interface HostStatusApi {
  reportProjectState: (opts: HostProjectStatus) => Promise<void>;
}

export function createHostStatusClient({
  client,
}: {
  client: Client;
}): HostStatusApi {
  return createServiceClient<HostStatusApi>({
    service: "project-host",
    subject: STATUS_SUBJECT,
    client,
  });
}

export function createHostStatusService({
  client,
  impl,
}: {
  client: Client;
  impl: HostStatusApi;
}): ConatService {
  return createServiceHandler<HostStatusApi>({
    service: "project-host",
    subject: STATUS_SUBJECT,
    description: "Project-host -> master status updates",
    client,
    impl,
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
