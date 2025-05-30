export type State = "disconnected" | "connected" | "closed";

export interface Location {
  project_id?: string;
  compute_server_id?: number;

  account_id?: string;
  browser_id?: string;

  path?: string;
}
