export type State = "disconnected" | "connected" | "closed";

export interface Location {
  project_id?: string;
  compute_server_id?: number;

  account_id?: string;
  browser_id?: string;

  path?: string;
}

type EventType = "total" | "add" | "delete" | "deny";
type ValueType = "count" | "limit";
type MetricKey = `${EventType}:${ValueType}`;
export type Metrics = { [K in MetricKey]?: number };
