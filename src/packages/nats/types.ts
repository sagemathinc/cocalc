import type { NatsConnection } from "@nats-io/nats-core";
import type { EventEmitter } from "events";

export interface NatsEnv {
  // nats connection, but frontend extends it to be an EventEmitter
  nc: NatsConnection & Partial<EventEmitter>;
  jc; // jsoncodec
  // compute sha1 hash efficiently (set differently on backend)
  sha1?: (string) => string;
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
