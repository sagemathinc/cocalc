import { TypedMap } from "../app-framework/TypedMap";
import { Map } from "immutable";

export type MentionsMap = Map<string, MentionInfo>;

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
  users?: Map<
    string, // UUIDs
    TypedMap<{
      read?: boolean;
      saved?: boolean;
    }>
  >;
}>;

export type MentionFilter = "read" | "unread" | "saved" | "all";
