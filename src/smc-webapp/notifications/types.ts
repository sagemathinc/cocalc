import { TypedMap } from "../app-framework/TypedMap";

export type MentionInfo = TypedMap<{
  path: string;
  priority: number;
  project_id: string;
  source: string;
  target: string;
  time: Date;
  description?: string;
}>;
