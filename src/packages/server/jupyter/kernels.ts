/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getProject from "./global-project-pool";
import LRU from "lru-cache";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { projectApiClient } from "@cocalc/conat/project/api";
import { conat } from "@cocalc/backend/conat";

const cache = new LRU<string, object[]>({
  ttl: 30000,
  max: 300,
});

const log = getLogger("jupyter-api:kernels");

async function getConfig() {
  log.debug("get config");
  const { jupyter_account_id, jupyter_api_enabled } = await getServerSettings();

  return {
    jupyter_account_id,
    jupyter_api_enabled,
  };
}

export default async function getKernels({
  project_id,
  account_id,
}: {
  project_id?: string;
  account_id?: string;
}): Promise<object[]> {
  if (project_id != null) {
    if (account_id == null) {
      throw Error(
        "account_id must be specified -- make sure you are signed in",
      );
    }
    if (!(await isCollaborator({ project_id, account_id }))) {
      throw Error("permission denied -- user must be collaborator on project");
    }
  }

  const key = project_id ?? "global";
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  if (project_id == null) {
    const { jupyter_account_id, jupyter_api_enabled } = await getConfig();
    if (!jupyter_api_enabled) {
      throw Error("Jupyter API is not enabled on this server.");
    }
    project_id = await getProject();
    account_id = jupyter_account_id;
  }
  const api = projectApiClient({ project_id, client: conat() });
  const kernels = await api.jupyter.kernels();
  cache.set(key, kernels);
  return kernels;
}
