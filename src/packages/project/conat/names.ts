import * as data from "@cocalc/project/data";
import { projectSubject, projectStreamName } from "@cocalc/conat/names";

export function getSubject({
  path,
  service,
  compute_server_id = data.compute_server_id,
  project_id = data.project_id,
}: {
  path?: string;
  service: string;
  compute_server_id?: number;
  project_id?: string;
}) {
  return projectSubject({ compute_server_id, project_id, path, service });
}

export function getStreamName({
  path,
  service,
  project_id = data.project_id,
}: {
  path?: string;
  service?: string;
  project_id?: string;
}) {
  return projectStreamName({ path, service, project_id });
}
