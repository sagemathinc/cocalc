class ProjectsActions {
  public open_first_visible_project(switch_to: boolean = true): void {
    const project_id = visible_projects[0]; // todo -- have to get from store...
    if (project_id != null) {
      this.setState({ search: "" });
      this.open_project({ project_id, switch_to });
    }
  }

  public   toggle_hashtag(tag:string) {
    const { selected_hashtags } = this.props;
    const filter = this.filter();
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
    actions.setState({ selected_hashtags });
  },
}
