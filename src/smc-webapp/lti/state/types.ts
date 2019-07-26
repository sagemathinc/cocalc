import { Set } from "immutable";

export interface GlobalState {
  account_info?: AccountInfo;
  current_path: string;
  file_listings: { [key: string]: { [key: string]: string[] } };
  loading: boolean;
  opened_project_id: string;
  projects: Projects;
  route: Route;
  selected_entries: SelectedEntries;
}

export enum Route {
  Home = "project-selection",
  Project = "opened-project"
}

// Project UUID : ProjectInfo
export type Projects = { [key: string]: ProjectInfo };

// Project UUID : Set<project-path>
export type SelectedEntries = { [key: string]: Set<string> };

export type DirectoryListing = any;

// { project_id : path[] }
export type SelectedItems = { [key: string]: string[] };

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

export type Action =
  | {
      type: "initial_load";
      projects: Projects;
      account_info?: AccountInfo;
    }
  | { type: "open_project"; id: string }
  | {
      type: "add_directory_listing";
      listing: string;
      path: string;
      project_id: string;
    }
  | { type: "open_directory"; path: string }
  | { type: "open_parent_directory" };
