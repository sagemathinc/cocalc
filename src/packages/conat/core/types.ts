interface User {
  account_id?: string;
  project_id?: string;
  hub_id?: string;
  error?: string;
}

export interface ServerInfo {
  max_payload: number;
  id?: string;
  clusterName?: string;
  user?: User;
}

export interface ConnectionStats {
  user?: User;
  send: { messages: number; bytes: number };
  recv: { messages: number; bytes: number };
  subs: number;
  connected?: number; // time connected
  active?: number;
  // ip address
  address?: string;
}
