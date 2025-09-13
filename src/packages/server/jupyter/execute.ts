/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getProject from "./global-project-pool";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { projectApiClient } from "@cocalc/conat/project/api";
import { conat } from "@cocalc/backend/conat";

const log = getLogger("jupyter-api:execute");

const GLOBAL_LIMITS = {
  timeout_ms: 30000,
  timeout_ms_per_cell: 15000,
  max_output: 2500000,
  max_output_per_cell: 500000,
};

// For now we use a pool size of 4 in our general project(s), with a 6 hour idle timeout.
// This will be configurable via admin settings.  The pool shrinks to 1 after 12 hours.
const GLOBAL_POOL = { size: 4, timeout_s: 6 * 60 * 60 };

const PROJECT_LIMITS = {
  timeout_ms: 45000,
  timeout_ms_per_cell: 30000,
  max_output: 5000000,
  max_output_per_cell: 1000000,
};

// For now, we use a pool size of 2 in user's projects, to avoid using
// much memory, with 30 min idle timeout.  Note that the pool only shrinks
// to 1 after 30 minutes, so it's not so bad.
const PROJECT_POOL = { size: 2, timeout_s: 30 * 60 };

interface Options {
  input?: string; // new input that user types
  kernel?: string;
  history?: string[];
  account_id?: string;
  tag?: string;
  project_id?: string;
  path?: string;
  timeout?: number;
}

export async function execute({
  input,
  kernel,
  account_id,
  history,
  tag,
  project_id,
  path,
  timeout = 30_000,
}: Options): Promise<{
  output: object[];
  created: Date;
} | null> {
  log.debug("execute", {
    input,
    kernel,
    history,
    account_id,
    tag,
    project_id,
    path,
  });

  if (input == null) {
    throw Error("input or hash must not be null");
  }
  if (kernel == null) {
    throw Error("kernel must be specified in hash is not specified");
  }

  const created = new Date();

  // Execute the code.
  let request_project_id, pool, limits;
  if (project_id == null) {
    const { jupyter_api_enabled } = await getServerSettings();
    if (!jupyter_api_enabled) {
      throw Error("Jupyter API is not enabled on this server.");
    }

    request_project_id = await getProject();

    pool = GLOBAL_POOL;
    limits = GLOBAL_LIMITS;
  } else {
    request_project_id = project_id;
    // both project_id and account_id must be set and account_id must be a collab
    if (account_id == null) {
      throw Error(
        "account_id must be specified -- make sure you are signed in",
      );
    }
    if (!(await isCollaborator({ project_id, account_id }))) {
      throw Error("permission denied -- user must be collaborator on project");
    }
    pool = PROJECT_POOL;
    limits = PROJECT_LIMITS;
  }

  const api = projectApiClient({
    project_id: request_project_id,
    timeout,
    client: conat(),
  });
  const output = await api.jupyter.apiExecute({
    input,
    history,
    kernel,
    path,
    pool,
    limits,
  });

  return { output, created };
}
