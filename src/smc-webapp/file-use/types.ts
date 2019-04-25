import { TypedMap } from "../app-framework/TypedMap";
import { Map } from "immutable";

export type FileActivityMap = Map<string, FileActivityInfo>;

export type FileActivityInfo = TypedMap<{
  id: string;
  last_edited: Date;
  path: string;
  project_id: string; // UUID
  users?: Map<
    string, // UUIDs
    UsersActivity
  >;
}>;

export type UsersActivity = TypedMap<{
  chat?: Date;
  chatseen?: Date;
  edit?: Date;
  open?: Date;
  read?: Date;
  video?: Date;
}>;
