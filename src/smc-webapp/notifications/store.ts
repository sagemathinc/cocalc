import { Map } from "immutable";
import { Store } from "../app-framework";
import { MentionInfo } from "./types";

export interface MentionsState {
  mentions: Map<string, MentionInfo>;
}

export class MentionsStore extends Store<MentionsState> {
  constructor(name, redux) {
    super(name, redux);
  }
}
