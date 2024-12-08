/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Store } from "@cocalc/frontend/app-framework";
import { MentionsMap, NotificationFilter } from "./types";

export interface MentionsState {
  mentions: MentionsMap;
  filter: NotificationFilter;
  // optional id of currently selected thing
  id?: number;
}
export const MentionsState = null; // webpack + TS es2020 modules need this

export class MentionsStore extends Store<MentionsState> {
  constructor(name, redux) {
    super(name, redux);
  }

  getUnreadSize = (): number => {
    const mentions = this.get("mentions");
    if (mentions == null) {
      // e.g., happens with a brand new account.
      return 0;
    }
    const account_store = this.redux.getStore("account");
    if (account_store == null) {
      return 0;
    }

    const account_id = account_store.get("account_id");
    let unread_count = 0;
    mentions.map((mention) => {
      if (
        mention.get("target") == account_id &&
        !mention.getIn(["users", account_id, "read"])
      ) {
        unread_count += 1;
      }
    });

    return unread_count;
  };
}
