class Store {
  // Returns true if the user has any hidden projects
  has_hidden_projects(): boolean {
    for (const [project_id] of this.get("project_map")) {
      if (
        this.project_is_in_filter(project_id, true, false) ||
        this.project_is_in_filter(project_id, true, true)
      ) {
        return true;
      }
    }
    return false;
  }

  // Returns true if this project has any deleted files
  has_deleted_projects(): boolean {
    for (const [project_id] of this.get("project_map")) {
      if (
        this.project_is_in_filter(project_id, false, true) ||
        this.project_is_in_filter(project_id, true, true)
      ) {
        return true;
      }
    }
    return false;
  }
}
