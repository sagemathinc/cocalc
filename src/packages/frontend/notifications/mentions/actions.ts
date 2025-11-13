/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Actions } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { once } from "@cocalc/util/async-utils";
import { MentionsState } from "./store";
import { NotificationFilter, MentionInfo } from "./types";

export class MentionsActions extends Actions<MentionsState> {
  public update_state(mentions): void {
    // Sort by most recent
    const sorted_mentions = mentions.sort((a, b) => {
      return b.get("time").getTime() - a.get("time").getTime();
    });

    this.setState({ mentions: sorted_mentions });
  }

  public set_filter(filter: NotificationFilter, id?: number) {
    this.setState({ filter, id });
  }

  private update_mention(new_mention: MentionInfo, id: string) {
    const store = this.redux.getStore("mentions");
    if (store == undefined) return;

    const current_mentions = store.get("mentions").set(id, new_mention);
    this.setState({ mentions: current_mentions });
  }

  public mark(mention: MentionInfo, id: string, type: "read" | "unread"): void {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) return;

    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "read"],
      type === "read",
    );

    this.update_mention(adjusted_mention, id);
    this.set(adjusted_mention);
  }

  private async saveAdjustedMention(
    id: string,
    mention: MentionInfo,
    delay = false,
  ) {
    // if setting this in the DB worked, we wait 50 ms and update the UI
    if (await this.set(mention)) {
      this.update_mention(mention, id);
      if (delay) {
        await new Promise((resolve) => setTimeout(resolve, 50)); // don't overwhelm the server
      }
    }
  }

  public async markAll(
    project_id: string,
    as: "read" | "unread",
  ): Promise<void> {
    const store = this.redux.getStore("mentions");
    if (store == undefined) return;
    const current_mentions = store.get("mentions");

    const account_store = this.redux.getStore("account");
    if (account_store == undefined) return;

    const account_id = account_store.get("account_id");

    for (const [id, mention] of current_mentions) {
      if (
        mention.get("project_id") == project_id &&
        mention.getIn(["users", account_id, "read"]) != (as === "read")
      ) {
        const adjusted = mention.setIn(
          ["users", account_id, "read"],
          as === "read",
        );
        await this.saveAdjustedMention(id, adjusted, true);
      }
    }
  }

  public async saveAll(
    project_id: string,
    filter: "read" | "unread",
  ): Promise<void> {
    const store = this.redux.getStore("mentions");
    if (store == undefined) return;

    const current_mentions = store.get("mentions");
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    for (const [id, mention] of current_mentions) {
      if (
        mention.get("project_id") == project_id &&
        mention.getIn(["users", account_id, "read"]) == (filter === "read")
      ) {
        const adjusted = mention.setIn(["users", account_id, "saved"], true);
        await this.saveAdjustedMention(id, adjusted, true);
      }
    }
  }

  public markSaved(
    mention: MentionInfo,
    id: string,
    as: "saved" | "unsaved",
  ): void {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return;
    }
    const account_id = account_store.get("account_id");
    const adjusted_mention = mention.setIn(
      ["users", account_id, "saved"],
      as === "saved",
    );

    this.update_mention(adjusted_mention, id);
    this.set(adjusted_mention);
  }

  // return true if successful, false otherwise
  private async set(obj): Promise<boolean> {
    try {
      if (!webapp_client.is_signed_in()) {
        await once(webapp_client, "signed_in");
      }

      const table = this.redux.getTable("mentions");
      if (table == undefined) return false;

      await table.set(obj);
      return true;
    } catch (error) {
      const err = error;
      console.warn("WARNING: mentions error -- ", err);
    }
    return false;
  }
}
