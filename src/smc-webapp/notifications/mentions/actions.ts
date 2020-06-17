/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Actions } from "../../app-framework";
import { MentionsState } from "./store";
import { MentionInfo, MentionFilter } from "./types";

import { once } from "smc-util/async-utils";

const { webapp_client } = require("../../webapp_client");

export class MentionsActions extends Actions<MentionsState> {
  update_state = (mentions): void => {
    // Sort by most recent
    const sorted_mentions = mentions.sort((a, b) => {
      return b.get("time").getTime() - a.get("time").getTime();
    });

    this.setState({ mentions: sorted_mentions });
  };

  set_filter = (filter: MentionFilter) => {
    this.setState({ filter });
  };

  private update_mention = (new_mention: MentionInfo, id: string) => {
    const store = this.redux.getStore("mentions");
    if (store == undefined) {
      return;
    }
    const current_mentions = store.get("mentions").set(id, new_mention);
    this.setState({ mentions: current_mentions });
  };

  mark_read = (mention: MentionInfo, id: string): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(["users", account_id, "read"], true);

    this.update_mention(adjusted_mention, id);
    this.set(adjusted_mention);
  };

  mark_unread = (mention: MentionInfo, id: string): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "read"],
      false
    );

    this.update_mention(adjusted_mention, id);
    this.set(adjusted_mention);
  };

  mark_saved = (mention: MentionInfo, id: string): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "saved"],
      true
    );

    this.update_mention(adjusted_mention, id);
    this.set(adjusted_mention);
  };

  mark_unsaved = (mention: MentionInfo, id: string): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "saved"],
      false
    );

    this.update_mention(adjusted_mention, id);
    this.set(adjusted_mention);
  };

  private async set(obj) {
    try {
      if (!webapp_client.is_signed_in()) {
        await once(webapp_client, "signed_in");
      }
      const table = this.redux.getTable("mentions");
      if (table == undefined) {
        return;
      }
      await table.set(obj);
    } catch (error) {
      const err = error;
      console.warn("WARNING: mentions error -- ", err);
    }
  }
}
