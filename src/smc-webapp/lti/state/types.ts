export interface GlobalState {
  route: Route;
  projects: ProjectInfo[];
  account_info?: AccountInfo;
  loading: boolean;
}

export enum Route {
  Home = "project-selection"
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
  deleted: string;
  state: { time: string; state: string };
  users: { [key: string]: { group: string; hide: boolean } };
}

export type Action =
  | {
      type: "initial_load";
      projects?: ProjectInfo[];
      account_info?: AccountInfo;
    }
  | { type: "set_projects"; projects: ProjectInfo[] }
  | { type: "set_account_info"; account_info: AccountInfo }
  | { type: "change_route"; route: string };