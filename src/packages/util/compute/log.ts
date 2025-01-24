import type {
  State,
  SpendLimit,
  HealthCheck,
  ShutdownTime,
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

// DEPRECATED: for backward compatibility only...
export interface AutomaticShutdownEntry {
  action: "automatic-shutdown";
  automatic_shutdown: any;
}

export interface HealthCheckFailureEntry {
  action: "health-check-failure";
  healthCheck: HealthCheck;
}

export interface IdleTimeoutEntry {
  action: "idle-timeout";
  idle_timeout: number;
}

export interface ShutdownTimeEntry {
  action: "shutdown-time";
  shutdownTime: ShutdownTime;
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
  | HealthCheckFailureEntry
  | IdleTimeoutEntry
  | ShutdownTimeEntry
  | SpendLimitEntry
) &
  Event;

export type ComputeServerEventLogEntry =
  | ConfigurationChange
  | StateChange
  | AutomaticShutdownEntry
  | HealthCheckFailureEntry
  | IdleTimeoutEntry
  | ShutdownTimeEntry
  | SpendLimitEntry
  | Error;
