import type { EventEmitter } from "events";
import type { CB } from "@cocalc/util/types/callback";
import type {
  CallConatServiceFunction,
  CreateConatServiceFunction,
} from "@cocalc/conat/service";

// What we need the client to implement so we can use
// it to support a table.
export interface Client extends EventEmitter {
  is_project: () => boolean;
  is_compute_server: () => boolean;
  is_browser: () => boolean;
  dbg: (str: string) => Function;
  query: (opts: any) => void;
  query_cancel: Function;
  server_time: Function;
  alert_message?: Function;
  is_connected: () => boolean;
  is_signed_in: () => boolean;
  touch_project: (project_id: string, compute_server_id?: number) => void;
  set_connected?: Function;
  is_deleted: (path: string, project_id: string) => true | false | undefined;
  callConatService?: CallConatServiceFunction;
  createConatService?: CreateConatServiceFunction;
  client_id?: () => string | undefined;
}

export interface ClientFs extends Client {
  write_file: (opts: { path: string; data: string; cb: CB<void> }) => void;
  path_read: (opts: {
    path: string;
    maxsize_MB?: number; // in megabytes; if given and file would be larger than this, then cb(err)
    cb: CB<string>; // cb(err, file content as string (not Buffer!))
  }) => Promise<void>;
  path_stat: (opts: { path: string; cb: CB }) => any;
  path_exists: (opts: { path: string; cb: CB }) => any;
  path_access: (opts: { path: string; mode: string; cb: CB }) => void;
  watch_file: (opts: {
    path: string;
    interval?: number;
    debounce?: number;
  }) => any;
  server_time: () => Date;
  client_id: () => string | undefined;
}

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
export type WebsocketState = "offline" | "online" | "destroyed";

export interface ProjectWebsocket extends EventEmitter {
  // These are the standard things that Primus provides:
  write(data: any): this;
  end(data?: any): this;
  destroy(): void;
  on(event: "open" | "end", handler: () => void): this;
  on(
    event: "reconnect" | "reconnect scheduled" | "reconnected",
    handler: (opts: ReconnectEventOpts) => void,
  ): this;
  on(
    event: "reconnect timeout" | "reconnect failed",
    handler: (err: Error, opts: ReconnectEventOpts) => void,
  ): this;
  on(event: "data", handler: (message: any) => void): this;
  on(event: "error", handler: (err: Error) => void): this;
  open(): this;

  // Special things for cocalc
  // a verbose flag
  verbose?: boolean;
  // added by responder plugin; used to write one message and get back a single response.
  writeAndWait: (message: any, cb: Function) => void;
  // added by multiplex plugin; used to multiplex many channels over a single websocket.
  channel: (channel_name: string) => Channel;
  // we explicitly add this
  state: WebsocketState;
}

export interface API {
  version(): Promise<number>;
}

export interface ProjectClient {
  websocket(project_id: string): Promise<ProjectWebsocket>;
  api(project_id: string): Promise<API>;
}

export interface AppClient extends Client {
  client_id(): string | undefined; // undefined = not signed in so don't know our id.
  is_deleted(filename: string, project_id: string): boolean | undefined;
  mark_file(opts: any): Promise<void>;
  project_client: ProjectClient;
}
