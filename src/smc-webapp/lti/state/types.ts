export interface GlobalState {
  route: Route;
  projects: Projects;
  account_info?: AccountInfo;
  loading: boolean;
  opened_project_id: string;
}

export type Projects = { [key: string]: ProjectInfo };

export enum Route {
  Home = "project-selection",
  Project = "opened-project"
}

export interface AccountInfo {
  account_id: string;
  email_address: string;
  first_name: string;
  last_name: string;
}

export interface ProjectInfo {
  project_id: string;
  title: string;
  description: string;
  deleted?: boolean;
  state: { time: string; state: string };
  users: { [key: string]: { group: string; hide: boolean } };
}

export type DirectoryListing = any;

export type Action =
  | {
      type: "initial_load";
      projects: Projects;
      account_info?: AccountInfo;
    }
  | { type: "open_project"; id: string };
