// See packages/next/pages/api/hub.ts

import { projectSubject } from "@cocalc/conat/names";
import { conat } from "@cocalc/backend/conat";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
const DEFAULT_TIMEOUT = 15000;

let client: ConatClient | null = null;
export default async function projectBridge({
  project_id,
  compute_server_id,
  name,
  args,
  timeout,
}: {
  project_id: string;
  compute_server_id?: number;
  name: string;
  args?: any[];
  timeout?: number;
}) {
  client ??= conat();
  return await callProject({
    client,
    project_id,
    compute_server_id,
    name,
    args,
    timeout,
  });
}

async function callProject({
  client,
  project_id,
  compute_server_id = 0,
  name,
  args = [],
  timeout = DEFAULT_TIMEOUT,
}: {
  client: ConatClient;
  project_id: string;
  compute_server_id?: number;
  name: string;
  args?: any[];
  timeout?: number;
}) {
  const subject = projectSubject({
    project_id,
    compute_server_id,
    service: "api",
  });
  try {
    const data = { name, args };
    // we use waitForInterest because often the project hasn't
    // quite fully started.
    const resp = await client.request(subject, data, {
      timeout,
      waitForInterest: true,
    });
    return resp.data;
  } catch (err) {
    err.message = `${err.message} - callHub: subject='${subject}', name='${name}', code='${err.code}' `;
    throw err;
  }
}
