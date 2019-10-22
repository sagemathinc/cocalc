import { Map } from "immutable";
import { TypedMap } from "../../app-framework/TypedMap";

type UserRecord = TypedMap<{ group: string; upgrades: any }>;

export type Project = TypedMap<{
  title: string;
  description: string;
  project_id: string;
  deleted?: boolean;
  hidden?: boolean;
  users: Map<string, UserRecord>;
  state?: { state: "opened" | "running" | "starting" | "stopping" };
  status?: Map<string, any>;
  settings: Map<string, any>;
  compute_image: string;
}>;
