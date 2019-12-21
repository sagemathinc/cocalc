const { webapp_client } = require("../../webapp_client");

import { callback2 } from "smc-util/async-utils";
import { account_id_to_username } from "./util";

// Returns the json file that we exported to.

export async function export_to_json(
  syncdoc,
  path: string,
  project_id: string
): Promise<string> {
  if (syncdoc == null || syncdoc.get_state() != "ready") {
    throw Error("History not yet available.  Try again later.");
  }

  const x = syncdoc.export_history({ patches: false, patch_lengths: true });
  // Replace account_id's by user names:
  for (const entry of x) {
    entry.user = account_id_to_username(entry.account_id, project_id);
  }

  path = path + "-timetravel.json";

  await callback2(webapp_client.write_text_file_to_project, {
    project_id,
    path,
    content: JSON.stringify(x, null, 2)
  });

  return path;
}
