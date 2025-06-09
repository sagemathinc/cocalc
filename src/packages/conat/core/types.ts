interface User {
  account_id?: string;
  project_id?: string;
  hub_id?: string;
  error?: string;
}

export interface ServerInfo {
  max_payload: number;
  id: string;
  user?: User;
}

export interface ServerConnectionStats {
  user?: User;
  send: { messages: number; bytes: number };
  subs: number;
  connected?: number; // time connected
  active?: number;
}

export interface ConnectionStats extends ServerConnectionStats {
  recv: { messages: number; bytes: number };
}
