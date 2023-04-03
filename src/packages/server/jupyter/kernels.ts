/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import getOneProject from "@cocalc/server/projects/get-one";
import callProject from "@cocalc/server/projects/call";
import { jupyter_kernels } from "@cocalc/util/message";
import LRU from "lru-cache";

// cache for 90s, since projects not under user control so kernels don't get installed often.
const cache = new LRU<"kernel_data", object[]>({
  ttl: 90000,
  max: 5 /* silly since only one possible key */,
});

const log = getLogger("jupyter:execute");

async function getConfig() {
  log.debug("get config");
  const { jupyter_account_id, jupyter_api_enabled } = await getServerSettings();

  return {
    jupyter_account_id,
    jupyter_api_enabled,
  };
}

export default async function getKernels(): Promise<object[]> {
  if (cache.has("kernel_data")) {
    return cache.get("kernel_data")!;
  }
  // TODO -- await checkForAbuse({ account_id, analytics_cookie });
  const { jupyter_account_id, jupyter_api_enabled } = await getConfig();
  if (!jupyter_api_enabled) {
    throw Error("Jupyter API is not enabled on this server.");
  }
  const { project_id } = await getOneProject(jupyter_account_id);
  const mesg = jupyter_kernels({});
  const resp = await callProject({
    account_id: jupyter_account_id,
    project_id,
    mesg,
  });
  if (resp.error) {
    throw Error(resp.error);
  }
  cache.set("kernel_data", resp.kernels);
  return resp.kernels;
}
