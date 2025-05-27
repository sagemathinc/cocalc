export interface ServerInfo {
  max_payload: number;
  user?: {
    account_id?: string;
    project_id?: string;
    hub_id?: string;
    error?: string;
  };
}
