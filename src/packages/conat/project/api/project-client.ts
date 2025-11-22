/*
Create a client for the project's api.  Anything that can publish to *.project-project_id... can use this.
*/

import { projectSubject } from "@cocalc/conat/names";
import { type Client, connect } from "@cocalc/conat/core/client";
import { isValidUUID } from "@cocalc/util/misc";
import { type ProjectApi, initProjectApi } from "./index";

const DEFAULT_TIMEOUT = 15000;
const service = "api";

export function projectApiClient({
  project_id,
  compute_server_id = 0,
  client = connect(),
  timeout = DEFAULT_TIMEOUT,
}: {
  project_id: string;
  compute_server_id?: number;
  client?: Client;
  timeout?: number;
}): ProjectApi {
  if (!isValidUUID(project_id)) {
    throw Error(`project_id = '${project_id}' must be a valid uuid`);
  }
  const subject = projectSubject({ project_id, compute_server_id, service });

  const isReady = async () => {
    return await client.interest(subject);
  };

  const waitUntilReady = async ({ timeout }: { timeout?: number } = {}) => {
    await client.waitForInterest(subject, { timeout });
  };

  const callProjectApi = async ({ name, args }) => {
    return await callProject({
      client,
      subject,
      timeout,
      name,
      args,
    });
  };
  return initProjectApi({ callProjectApi, isReady, waitUntilReady });
}

async function callProject({
  client,
  subject,
  name,
  args = [],
  timeout = DEFAULT_TIMEOUT,
}: {
  client: Client;
  subject: string;
  name: string;
  args: any[];
  timeout?: number;
}) {
  const resp = await client.request(
    subject,
    { name, args },
    // we use waitForInterest because often the project hasn't
    // quite fully started.
    { timeout, waitForInterest: true },
  );
  return resp.data;
}
