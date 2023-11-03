import type { State } from "@cocalc/util/db-schema/compute-servers";

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

interface Error {
  action: "error";
  error: string;
}

export type ComputeServerEvent = (ConfigurationChange | StateChange | Error) &
  Event;

export type ComputeServerEventLogEntry =
  | ConfigurationChange
  | StateChange
  | Error;
