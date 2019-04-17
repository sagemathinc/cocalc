import { TypedMap } from "../app-framework/TypedMap";
import { Map } from "immutable";

export type MentionInfo = TypedMap<{
  path: string;
  priority: number;
  project_id: string;
  source: string;
  target: string;
  time: Date;
  action?: "email" | "ignore";
  error?: string;
  description?: string;
  users?: Map<string, TypedMap<{ read?: boolean, saved?: boolean }>>;
}>;
