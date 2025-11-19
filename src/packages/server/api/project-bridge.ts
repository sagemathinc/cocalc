// See packages/next/pages/api/hub.ts

import { projectSubject } from "@cocalc/conat/names";
import { conat } from "@cocalc/backend/conat";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { getProject } from "@cocalc/server/projects/control";
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
    // Ensure the project is running before making the API call
    const project = getProject(project_id);
    if (project) {
      await project.start();
    }

    // For system.test(), inject project_id into args[0] if not already present
    let finalArgs = args;
    if (name === "system.test" && (!args || args.length === 0)) {
      finalArgs = [{ project_id }];
    }
    const data = { name, args: finalArgs };
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
