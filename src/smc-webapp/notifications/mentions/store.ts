import { Store } from "../../app-framework";
import { MentionsMap, MentionFilter } from "./types";

export interface MentionsState {
  mentions: MentionsMap;
  filter: MentionFilter;
}

export class MentionsStore extends Store<MentionsState> {
  constructor(name, redux) {
    super(name, redux);
  }

  get_unseen_size = (mentions: MentionsMap): number => {
    const account_store = this.redux.getStore("account");
    if (account_store == undefined) {
      return 0;
    }

    const account_id = account_store.get("account_id");
    let unseen_count = 0;
    mentions.map(mention => {
      if (
        mention.get("target") === account_id &&
        !mention.getIn(["users", account_id, "read"])
      ) {
        unseen_count += 1;
      }
    });

    return unseen_count;
  };
}
