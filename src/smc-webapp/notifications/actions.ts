import { Actions } from "../app-framework";
import { MentionsState } from "./store";

export class MentionsActions extends Actions<MentionsState> {
  update_state(mentions) {
    this.setState({mentions: mentions});
  }
}