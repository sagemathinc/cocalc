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

// jetstream name -- we use this canonical name for the KV and the stream associated
// to a project or account.  We use the same name for both.
export function jsName({
  project_id,
  account_id,
}: {
  project_id?: string;
  account_id?: string;
}) {
  if (project_id) {
    if (account_id) {
      throw Error("both account_id and project_id can't be set");
    }
    return `project-${project_id}`;
  }
  if (!account_id) {
    return "public";
  }
  return `account-${account_id}`;
}

export function streamSubject({
  project_id,
  account_id,
}: {
  project_id?: string;
  account_id?: string;
}) {
  if (project_id) {
    if (account_id) {
      throw Error("both account_id and project_id can't be set");
    }
    return `project.${project_id}.stream.>`;
  }
  if (!account_id) {
    return "public.stream.>";
  }
  return `account.${account_id}.stream.>`;
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
  if (!project_id) {
    throw Error("project_id must be set");
  }
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
  // service = optional name of the microservice, e.g., 'api', 'terminal'
  service,
  // path = optional name of specific path for that microservice -- replaced by its sha1
  path,
}: {
  project_id: string;
  service?: string;
  path?: string;
}): string {
  if (!project_id) {
    throw Error("project_id must be set");
  }
  let streamName = `project-${project_id}`;
  if (service) {
    streamName += "-" + service;
    if (path) {
      streamName += "-" + sha1(path);
    }
  }
  return streamName;
}

export function browserSubject({ account_id, sessionId, service }) {
  if (!sessionId) {
    throw Error("sessionId must be set");
  }
  if (!account_id) {
    throw Error("account_id must be set");
  }
  if (!service) {
    throw Error("service must be set");
  }
  return `${sessionId}.account-${account_id}.${service}`;
}
