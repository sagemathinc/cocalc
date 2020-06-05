/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export function submit_mentions(mentions) {
  console.log("would submit mentions for", mentions);
  /*
  import { original_path } from "smc-util/misc";

  const CONTEXT_SIZE = 80;
  const account_store = this.redux.getStore("account");
  const store = this.store;
  if (account_store == null || store == null) {
    return;
  }
  store.get("unsent_user_mentions").map((mention) => {
    const end_of_mention_index =
      mention.get("plainTextIndex") + mention.get("display")?.length;
    const end_of_context_index = end_of_mention_index + CONTEXT_SIZE;

    // Add relevant ellipses depending on size of full message
    let description = "";
    if (mention.get("plainTextIndex") != 0) {
      description = "... ";
    }
    description += store
      .get("message_plain_text")
      .slice(end_of_mention_index, end_of_context_index)
      .trim();
    if (end_of_context_index < store.get("message_plain_text").length) {
      description += " ...";
    }

    // TODO: this is just naively assuming that no errors happen.
    // What if there is a network blip?
    // Then we would just loose the mention, which is no good. Do better.
    webapp_client.query_client.query({
      query: {
        mentions: {
          project_id: store.get("project_id"),
          path: original_path(store.get("path")),
          target: mention.get("id"),
          priority: 2,
          description,
          source: account_store.get_account_id(),
        },
      },
    });
  });
  */
}
