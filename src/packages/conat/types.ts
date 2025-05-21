export type ValueType = "json" | "binary";
import { type Client as ConatClient } from "@cocalc/conat/core/client";

export type NatsConnection = any;

export interface NatsEnv {
  // nats connection, but frontend extends it to be an EventEmitter
  nc: NatsConnection;
  jc; // jsoncodec

  cn: ConatClient;
}

export type State = "disconnected" | "connected" | "closed";

export type NatsEnvFunction = () => Promise<NatsEnv>;

export interface Location {
  project_id?: string;
  compute_server_id?: number;

  account_id?: string;
  browser_id?: string;

  path?: string;
}
