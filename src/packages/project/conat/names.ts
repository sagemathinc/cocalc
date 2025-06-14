import { compute_server_id, project_id } from "@cocalc/project/data";
import { projectSubject, projectStreamName } from "@cocalc/conat/names";

export function getSubject(opts: { path?: string; service: string }) {
  return projectSubject({ ...opts, compute_server_id, project_id });
}

export function getStreamName(opts: { path?; service? }) {
  return projectStreamName({ ...opts, project_id });
}
