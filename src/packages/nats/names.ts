/*
Names we use with nats.

For Jetstream:

project-{project_id}-{compute_server_id}[.-service][.-sha1(path)]

For Subjects:

 project.{project-id}.{compute_server_id}[.{service}][.{path}]

*/

import { sha1 } from "@cocalc/util/misc";
import generateVouchers from "@cocalc/util/vouchers";

// nice alphanumeric string that can be used as nats subject, and very
// unlikely to randomly collide with another browser tab from this account.
export function randomId() {
  return generateVouchers({ count: 1, length: 10 })[0];
}



export function projectSubject({
  project_id,
  compute_server_id = 0,
  // service = optional name of the microservice, e.g., 'api', 'terminal'
  service,
  // path = optional name of specific path for that microservice -- replaced by its sha1
  path,
}: {
  project_id: string;
  compute_server_id?: number;
  service?: string;
  path?: string;
}): string {
  let subject = `project.${project_id}.${compute_server_id}`;
  if (service) {
    subject += "." + service;
    if (path) {
      subject += "." + sha1(path);
    }
  }
  return subject;
}

export function projectStreamName({
  project_id,
  compute_server_id = 0,
  // service = optional name of the microservice, e.g., 'api', 'terminal'
  service,
  // path = optional name of specific path for that microservice -- replaced by its sha1
  path,
}: {
  project_id: string;
  compute_server_id?: number;
  service?: string;
  path?: string;
}): string {
  let streamName = `project-${project_id}-${compute_server_id}`;
  if (service) {
    streamName += "-" + service;
    if (path) {
      streamName += "-" + sha1(path);
    }
  }
  return streamName;
}
