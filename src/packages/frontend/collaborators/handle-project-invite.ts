/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { QueryParams } from "../misc/query-params";
import { webapp_client } from "../webapp-client";
import { alert_message } from "../alerts";
import { redux } from "../app-framework";
import { delay } from "awaiting";

export const PROJECT_INVITE_QUERY_PARAM = "project-invite";

async function handleProjectInviteToken() {
  const token_id = QueryParams.get(PROJECT_INVITE_QUERY_PARAM);
  if (!token_id) {
    return;
  }
  QueryParams.remove(PROJECT_INVITE_QUERY_PARAM);
  const account_id = webapp_client.account_id;
  if (!account_id) return;
  addSelfToProjectUsingInviteToken(token_id);
}

export async function init() {
  await delay(0); // has to be after page loads...
  webapp_client.once("signed_in", handleProjectInviteToken);
}

async function addSelfToProjectUsingInviteToken(token_id) {
  if (webapp_client.account_id == null) return;

  const actions = redux.getActions("page");
  if (
    !(await actions.popconfirm({
      title: "Would you like to accept this project invitation?",
      description:
        "If you are visiting a link from somebody you trust, click 'Yes, accept invitation'. If this seems suspicious, click 'No'.  You can always open the invite link again if you change your mind.",
      okText: "Yes, accept invitation",
    }))
  ) {
    return;
  }
  try {
    const resp = await webapp_client.project_collaborators.add_collaborator({
      account_id: webapp_client.account_id,
      token_id,
    });
    console.log({ resp });
    const project_id = resp.project_id;
    if (typeof project_id == "string") {
      alert_message({
        type: "info",
        message: "You have been successfully added to the project!",
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
    }
  } catch (err) {
    alert_message({ type: "error", message: err.toString(), timeout: 30 });
  }
}
