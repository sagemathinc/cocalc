import { Map } from "immutable";
import { TypedMap } from "../../app-framework/TypedMap";

export type Project = TypedMap<{
  title: string;
  description: string;
  project_id: string;
  deleted?: boolean;
  hidden?: boolean;
  users: {[key: string]: any}
  state?: "opened" | "running" | "starting" | "stopping";
  status?: Map<string, any>;
  settings: Map<string, any>;
  compute_image: string;
}>;
