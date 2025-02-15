/*
Service for controlling a terminal served from a project/compute server.
*/

import { natsService, NatsService } from "./typed";

type Response = any;

export interface CreateSession {
  event: "create-session";
  env?: { [key: string]: string };
  command?: string;
  args?: string[];
  cwd?: string;
}

export interface Write {
  event: "write";
  data: string;
}

export interface Restart {
  event: "restart";
}

export interface CWD {
  event: "cwd";
}

export interface Kill {
  event: "kill";
}

export interface Size {
  event: "size";
  rows: number;
  cols: number;
  client: string;
}

export interface Boot {
  event: "boot";
  client: string;
}

export type Message =
  | CreateSession
  | Write
  | Restart
  | CWD
  | Kill
  | Size
  | Boot;

export type TerminalService = NatsService<Message, Response>;

export function terminalService({ project_id, path }) {
  return natsService<Message, Response>({
    project_id,
    path,
    service: "api",
    description: "Terminal API",
  });
}
