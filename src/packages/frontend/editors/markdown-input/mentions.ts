/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { original_path } from "@cocalc/util/misc";
import { redux } from "../../app-framework";
import { webapp_client } from "../../webapp-client";

interface Mention {
  account_id: string;
  description: string;
  fragment_id?: string;
}

export async function submit_mentions(
  project_id: string,
  path: string,
  mentions: Mention[]
): Promise<void> {
  const source = redux.getStore("account")?.get("account_id");
  if (source == null) {
    return;
  }
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
