/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { original_path } from "@cocalc/util/misc";
import { redux } from "../../app-framework";
import { webapp_client } from "../../webapp-client";
import chatGPT from "./chatgpt";

interface Mention {
  account_id: string;
  description: string;
  fragment_id?: string;
}

export async function submit_mentions(
  project_id: string,
  path: string,
  mentions: Mention[],
  value: string
): Promise<void> {
  const source = redux.getStore("account")?.get("account_id");
  if (source == null) {
    return;
  }
  // using a closure so can catch any weird error etc., but don't have
  // to wait on this before submitting other mentions.
  (async () => {
    try {
      await processChatGPT(project_id, path, mentions, value);
    } catch (err) {
      console.warn("Problem processing chatGPT", err);
    }
  })();
  for (const { account_id, description, fragment_id } of mentions) {
    try {
      await webapp_client.query_client.query({
        query: {
          mentions: {
            project_id,
            path: original_path(path),
            fragment_id,
            target: account_id,
            priority: 2,
            description,
            source,
          },
        },
      });
    } catch (err) {
      // TODO: this is just naively assuming that no errors happen.
      // What if there is a network blip?
      // Then we would just loose the mention, which is no good. Do better.
      console.warn("Failed to submit mention ", err);
    }
  }
}

async function processChatGPT(
  project_id: string,
  path: string,
  mentions: Mention[],
  value: string
): Promise<void> {
  for (const { account_id } of mentions) {
    if (account_id == "chatgpt") {
      await chatGPT({ project_id, path, value });
      // only want to send it once, even if they @chatgpt multiple times.
      return;
    }
  }
  // Also, we support just putting the string "@chatgpt", even if it isn't
  // processed as a mention.
  if (value.toLowerCase().includes("@chatgpt")) {
    await chatGPT({ project_id, path, value });
  }
}
