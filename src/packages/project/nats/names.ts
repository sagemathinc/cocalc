import { compute_server_id, project_id } from "@cocalc/project/data";
import { projectSubject, projectStreamName } from "@cocalc/nats/names";

export function getSubject(opts: { path?; service? }) {
  return projectSubject({ ...opts, compute_server_id, project_id });
}

export function getStreamName(opts: { path?; service? }) {
  return projectStreamName({ ...opts, project_id });
}
