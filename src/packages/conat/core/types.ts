export interface ServerInfo {
  max_payload: number;
  user?: {
    account_id?: string;
    project_id?: string;
    hub_id?: string;
    error?: string;
  };
}

export interface ConnectionStats {
  send: { messages: number; bytes: number };
  recv: { messages: number; bytes: number };
  subs: number;
}
