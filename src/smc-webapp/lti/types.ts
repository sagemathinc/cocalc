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
