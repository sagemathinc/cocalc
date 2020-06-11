import { redux } from "../app-framework";
import { Map, Set } from "immutable";

export class AllProjectsActions {
  private actions: any;

  constructor(actions) {
    this.actions = actions;
  }

  public toggle_hashtag(filter: string, tag: string): void {
    let selected_hashtags =
      redux.getStore("projects").get("selected_hashtags") ??
      Map<string, Set<string>>();
    let hashtags = selected_hashtags.get(filter) ?? Set<string>();
    if (hashtags.get(tag)) {
      hashtags = hashtags.delete(tag);
    } else {
      hashtags = hashtags.add(tag);
    }
    selected_hashtags = selected_hashtags.set(filter, hashtags);
    this.actions.setState({ selected_hashtags });
  }
}

function init() {
  const actions: any = redux.getActions("projects");
  const rewrite: any = new AllProjectsActions(actions);
  for (const x of ["toggle_hashtag"]) {
    actions[x] = rewrite[x].bind(rewrite);
  }
}

init();
