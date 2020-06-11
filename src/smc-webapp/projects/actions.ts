import { redux } from "../app-framework";

export class AllProjectsActions {
  private actions: any;

  constructor(actions) {
    this.actions = actions;
  }

  public toggle_hashtag(tag: string, filter: string) {
    let selected_hashtags = this.actions.store.get("selected_hashtags");
    if (!selected_hashtags[filter]) {
      selected_hashtags[filter] = {};
    }
    if (selected_hashtags[filter][tag]) {
      // disable the hashtag
      delete selected_hashtags[filter][tag];
    } else {
      // enable the hashtag
      selected_hashtags[filter][tag] = true;
    }
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
