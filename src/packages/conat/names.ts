/*
Names we use with conat.

For Jetstream:

project-{project_id}-{compute_server_id}[.-service][.-{encodeBase64(path)}]

For Subjects:

 project.{project-id}.{compute_server_id}[.{service}][.{path}]

*/

import generateVouchers from "@cocalc/util/vouchers";
import type { Location } from "./types";
import { encodeBase64 } from "@cocalc/conat/util";

// nice alphanumeric string that can be used as conat subject, and very
// unlikely to randomly collide with another browser tab from this account.
export function randomId() {
  return generateVouchers({ count: 1, length: 10 })[0];
}

// jetstream name -- we use this canonical name for the KV and the stream associated
// to a location in cocalc.
export function jsName({
  project_id,
  account_id,
  hub_id,
}: {
  project_id?: string;
  account_id?: string;
  hub_id?: string;
}) {
  if (project_id) {
    return `project-${project_id}`;
  }
  if (account_id) {
    return `account-${account_id}`;
  }
  if (hub_id) {
    return `hub-${hub_id}`;
  }
  if (process.env.COCALC_TEST_MODE) {
    return "test";
  } else {
    return "public";
  }
}

export function localLocationName({
  compute_server_id,
  browser_id,
  path,
}: Location): string {
  // !!CRITICAL WARNING!! If you ever modify this code, only do so in a way that adds a new field
  // so that the default value of that field leaves the output of this function UNCHANGED!
  // Otherwise, it gets used for defining the location of kv stores, and if it changes
  // on existing inputs, then all user data across all of cocalc would just go ** POOF ** !
  const v: string[] = [];
  if (compute_server_id) {
    v.push(`id=${compute_server_id}`);
  } else if (browser_id) {
    v.push(`id=${browser_id}`);
  }
  if (path) {
    v.push(`path=${path}`);
  }
  return v.join(",");
}

/*
Custom inbox prefix per "user"!

So can receive response to requests, and that you can ONLY receive responses
to your own messages and nobody else's!  This must be used in conjunction with
the inboxPrefix client option when connecting.  
*/
export function inboxPrefix({
  account_id,
  project_id,
  hub_id,
}: {
  account_id?: string;
  project_id?: string;
  hub_id?: string;
}) {
  // a project or account:
  return `_INBOX.${jsName({ account_id, project_id, hub_id })}`;
}

export function streamSubject({
  project_id,
  account_id,
  ephemeral,
}: {
  project_id?: string;
  account_id?: string;
  ephemeral?: boolean;
}) {
  const e = ephemeral ? "e" : "";
  if (project_id) {
    if (account_id) {
      throw Error("both account_id and project_id can't be set");
    }
    return `project.${project_id}.${e}stream.>`;
  }
  if (!account_id) {
    if (process.env.COCALC_TEST_MODE) {
      return `test.${e}stream.>`;
    }
    return `public.${e}stream.>`;
  }
  return `account.${account_id}.${e}stream.>`;
}

export function projectSubject({
  service,
  project_id,
  compute_server_id,
  // path = optional name of specific path for that microservice -- replaced by its base64 encoding
  path,
}: {
  project_id: string;
  service: string;
  compute_server_id?: number;
  path?: string;
}): string {
  if (!project_id) {
    throw Error("project_id must be set");
  }
  const segments = [
    "project",
    project_id,
    compute_server_id ?? "-",
    service ?? "-",
    path ? encodeBase64(path) : "-",
  ];
  return segments.join(".");
}

export function projectStreamName({
  project_id,
  // service = optional name of the microservice, e.g., 'api', 'terminal'
  service,
  // path = optional name of specific path for that microservice -- replaced by its base64 encoding
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
      streamName += "-" + encodeBase64(path);
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
