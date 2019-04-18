import { Actions } from "../app-framework";
import { MentionsState } from "./store";
import { MentionInfo, MentionFilter } from "./types";

import { callback2, once } from "smc-util/async-utils";

const { webapp_client } = require("../webapp_client");

export class MentionsActions extends Actions<MentionsState> {
  update_state = (mentions): void => {
    // Sort by most recent
    const sorted_mentions = mentions.sort((a, b) => {
      return b.get("time").getTime() - a.get("time").getTime();
    });

    this.setState({ mentions: sorted_mentions });
  }

  set_filter = (filter: MentionFilter) => {
    this.setState({ filter });
  }

  mark_read = (mention: MentionInfo): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(["users", account_id, "read"], true);

    this.set(adjusted_mention.toJS());
  }

  mark_unread = (mention: MentionInfo): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "read"],
      false
    );

    this.set(adjusted_mention.toJS());
  }

  mark_saved = (mention: MentionInfo): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "saved"],
      true
    );

    this.set(adjusted_mention.toJS());
  }

  mark_unsaved = (mention: MentionInfo): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "saved"],
      false
    );

    this.set(adjusted_mention.toJS());
  }

  private async set(obj) {
    try {
      if (!webapp_client.is_signed_in()) {
        await once(webapp_client, "signed_in");
      }
      await callback2(webapp_client.query, { query: { mentions: obj } });
    } catch (error) {
      const err = error;
      console.warn("WARNING: mentions error -- ", err);
    }
  }
}
