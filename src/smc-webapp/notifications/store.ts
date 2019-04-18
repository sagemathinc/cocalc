import { Store } from "../app-framework";
import { MentionsMap, MentionFilter } from "./types";

export interface MentionsState {
  mentions: MentionsMap;
  filter: MentionFilter;
}

export class MentionsStore extends Store<MentionsState> {
  constructor(name, redux) {
    super(name, redux);
  }
}
