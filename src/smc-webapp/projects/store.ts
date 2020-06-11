import { redux } from "../app-framework";
import { webapp_client } from "../webapp-client";

export class AllProjectsStore {
  private store: any;

  constructor(store) {
    this.store = store;
  }

  // Returns true if the project should be visible with the specified filters selected
  private project_is_in_filter(
    project_id: string,
    hidden: boolean,
    deleted: boolean
  ): boolean {
    const account_id = webapp_client.account_id;
    const project = this.store.getIn(["project_map", "project", project_id]);
    return (
      !!project.get("deleted") == deleted &&
      !!project.getIn("users", account_id, "hide") == hidden
    );
  }

  // Returns true if the user has any hidden projects
  public has_hidden_projects(): boolean {
    for (const [project_id] of this.store.get("project_map")) {
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
  public has_deleted_projects(): boolean {
    for (const [project_id] of this.store.get("project_map")) {
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

function init() {
  const store: any = redux.getStore("projects");
  const rewrite: any = new AllProjectsStore(store);
  for (const x of ["has_hidden_projects", "has_deleted_projects"]) {
    store[x] = rewrite[x].bind(rewrite);
  }
}

init();
