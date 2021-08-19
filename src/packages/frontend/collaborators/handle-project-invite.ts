/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { QueryParams } from "../misc/query-params";
import { webapp_client } from "../webapp-client";
import { alert_message } from "../alerts";
import { redux } from "../app-framework";
import { delay } from "awaiting";

export const PROJECT_INVITE_QUERY_PARAM = "project-invite";

async function handle_project_invite() {
  webapp_client.removeListener("signed_in", handle_project_invite); // only try at most once the first time.
  const token_id = QueryParams.get(PROJECT_INVITE_QUERY_PARAM);
  if (!token_id) return;
  QueryParams.remove(PROJECT_INVITE_QUERY_PARAM);
  const account_id = webapp_client.account_id;
  if (!account_id) return;
  add_self_to_project_using_token(token_id);
}

async function init() {
  await delay(0); // has to be after page loads...
  webapp_client.on("signed_in", handle_project_invite);
}
init();

export async function add_self_to_project_using_token(token_id) {
  if (webapp_client.account_id == null) return;
  try {
    const resp = await webapp_client.project_collaborators.add_collaborator({
      account_id: webapp_client.account_id,
      token_id,
    });
    const project_id = resp.project_id;
    if (typeof project_id == "string") {
      alert_message({
        type: "info",
        message:
          "You have been successfully added to the project!",
        timeout: 10,
      });
      // Wait until the project is available in the store:
      const store = redux.getStore("projects");
      await store.async_wait({
        until: () => store.getIn(["project_map", project_id]),
        timeout: 120,
      });
      // Now actually open it.
      redux.getActions("projects").open_project({ project_id });
    } else {
      throw Error("something went wrong (this shouldn't happen)"); // should never happen.
    }
  } catch (err) {
    alert_message({ type: "error", message: err.toString(), timeout: 30 });
  }
}
