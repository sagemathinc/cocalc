/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Actions } from "@cocalc/frontend/app-framework";
import { MentionsState } from "./store";
import { MentionInfo, MentionFilter } from "./types";

import { once } from "@cocalc/util/async-utils";

import { webapp_client } from "@cocalc/frontend/webapp-client";

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

  mark = (mention: MentionInfo, id: string, type: "read" | "unread"): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "read"],
      type === "read"
    );

    this.update_mention(adjusted_mention, id);
    this.set(adjusted_mention);
  };

  markAll = (project_id: string, as: "read" | "unread"): void => {
    const store = this.redux.getStore("mentions");
    if (store == undefined) {
      return;
    }
    const current_mentions = store.get("mentions");
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mentions = current_mentions.map((mention) => {
      if (mention.get("project_id") == project_id) {
        return mention.setIn(["users", account_id, "read"], as === "read");
      } else {
        return mention;
      }
    });

    this.setState({ mentions: adjusted_mentions });
    this.set(adjusted_mentions);
  };

  saveAll = (project_id: string, filter: "read" | "unread") => {
    const store = this.redux.getStore("mentions");
    if (store == undefined) {
      return;
    }
    const current_mentions = store.get("mentions");
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mentions = current_mentions.map((mention) => {
      if (
        mention.get("project_id") == project_id &&
        mention.getIn(["users", account_id, "read"]) == (filter === "read")
      ) {
        return mention.setIn(["users", account_id, "saved"], true);
      } else {
        return mention;
      }
    });

    this.setState({ mentions: adjusted_mentions });
    this.set(adjusted_mentions);
  };

  markSaved = (
    mention: MentionInfo,
    id: string,
    as: "saved" | "unsaved"
  ): void => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "saved"],
      as === "saved"
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
