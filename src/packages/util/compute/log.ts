import type {
  State,
  AutomaticShutdown,
  SpendLimit,
} from "@cocalc/util/db-schema/compute-servers";

interface Event {
  event: "compute-server";
  server_id: number;
}

interface StateChange {
  action: "state";
  state: State;
}

interface ConfigurationChange {
  action: "configuration";
  changes: { [param: string]: { from: any; to: any } };
}

export interface AutomaticShutdownEntry {
  action: "automatic-shutdown";
  automatic_shutdown: AutomaticShutdown;
}

export interface IdleTimeoutEntry {
  action: "idle-timeout";
  idle_timeout: number;
}

export interface SpendLimitEntry {
  action: "spend-limit";
  spendLimit: SpendLimit;
  total: number;
}

interface Error {
  action: "error";
  error: string;
}

export type ComputeServerEvent = (
  | ConfigurationChange
  | StateChange
  | Error
  | AutomaticShutdownEntry
  | IdleTimeoutEntry
  | SpendLimitEntry
) &
  Event;

export type ComputeServerEventLogEntry =
  | ConfigurationChange
  | StateChange
  | AutomaticShutdownEntry
  | IdleTimeoutEntry
  | SpendLimitEntry
  | Error;
