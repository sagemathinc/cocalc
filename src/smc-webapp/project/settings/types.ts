import { Map } from "immutable";
import { TypedMap } from "../../app-framework/TypedMap";

type UserRecord = TypedMap<{
  group: string;
  upgrades: { network: number };
}>;

export type ProjectStatus = TypedMap<{
  cpu: { usage: number };
  memory: { rss: number };
  disk_MB: number;
  start_ts: number;
}>;

export type ProjectSettings = Map<string, any>;

export type Project = TypedMap<{
  title: string;
  description: string;
  project_id: string;
  deleted?: boolean;
  hidden?: boolean;
  users: Map<string, UserRecord>;
  state?: { state: "opened" | "running" | "starting" | "stopping" };
  status: ProjectStatus;
  settings: ProjectSettings;
  compute_image: string;
}>;
