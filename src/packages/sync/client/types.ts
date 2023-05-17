import type { Client } from "@cocalc/sync/table/synctable";

export interface Channel {
  OPEN: number;
  CLOSE: number;
  readyState: number;
  write(x: any): boolean;
  on(event: string, f: Function): void;
  removeAllListeners(): void;
  end(): void;
  close(): void;
  connect(): void;
  conn: any;
  channel: string;
}

type ReconnectEventOpts = any; // defined in @types/primus but don't need them here...

export interface ProjectWebsocket {
  state: string;
  write(data: any): this;
  end(data?: any): this;
  destroy(): void;
  on(event: "open" | "end", handler: () => void): this;
  on(
    event: "reconnect" | "reconnect scheduled" | "reconnected",
    handler: (opts: ReconnectEventOpts) => void
  ): this;
  on(
    event: "reconnect timeout" | "reconnect failed",
    handler: (err: Error, opts: ReconnectEventOpts) => void
  ): this;
  on(event: "data", handler: (message: any) => void): this;
  on(event: "error", handler: (err: Error) => void): this;
  open(): this;
  writeAndWait: (message: any, cb: Function) => void;
}

interface API {
  symmetric_channel(name: string): Promise<Channel>;
}

interface ProjectClient {
  websocket(project_id: string): Promise<ProjectWebsocket>;
  api(project_id: string): Promise<API>;
}

export interface WebappClient extends Client {
  touch_project: (project_id: string) => void;
  project_client: ProjectClient;
}
