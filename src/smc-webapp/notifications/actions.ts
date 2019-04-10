import { Actions } from "../app-framework";
import { MentionsState } from "./store";

export class MentionsActions extends Actions<MentionsState> {
  update_state(mentions) {
    // Sort by most recent
    const sorted_mentions = mentions.sort((a, b) => {
      return b.get("time").getTime() - a.get("time").getTime();
    });

    this.setState({ mentions: sorted_mentions });
  }
}
