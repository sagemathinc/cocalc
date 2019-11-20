import { Map } from "immutable";
import { TypedMap } from "../../app-framework";

export type EventRecord = {
  id: string;
  event: TypedMap<ProjectEvent>;
  account_id: string;
  project_id?: string;
  time: Date;
};

export type EventRecordMap = TypedMap<EventRecord>

export type ProjectLogMap = Map<string, EventRecordMap>;

export type ProjectEvent =
  | AssistantEvent
  | ProjectControlEvent
  | FileActionEvent
  | LibraryEvent
  | UpgradeEvent
  | OpenFile
  | MiniTermEvent
  | CollaboratorEvent
  | X11Event
  | SetEvent
  | { event: "open_project" }
  | SystemEvent;

export type SetEvent = { event: "set" };

export type X11Event = {
  event: "x11";
  action: "launch";
  command: string;
  path: string;
};

export type CollaboratorEvent = {
  event: "invite_user" | "invite_nonuser" | "remove_collaborator";
  invitee_account_id?: string;
  invitee_email?: string;
  removed_name?: string;
};

export type UpgradeEvent = {
  event: "upgrade";
  upgrades: any;
};

export type LibraryEvent = {
  event: "library";
  target?: string;
  title: string;
};
export type AssistantEvent = {
  event: "assistant";
  action: "insert";
  lang: string;
  entry: string[];
  path: string;
};

export type MiniTermEvent = {
  event: "miniterm" | "termInSearch";
  input: string;
};

export type OpenFile = {
  event: "open";
  filename: string;
  time: number;
  type: string;
};

export type ProjectControlEvent = {
  event:
    | "start_project"
    | "project_stop_requested"
    | "project_restart_requested"
    | "project_stopped";
  time: number;
};

export type FileActionEvent = (
  | { action: "deleted" }
  | { action: "downloaded"; path?: string }
  | { action: "moved" }
  | { action: "copied" }
  | { action: "shared" }
  | { action: "uploaded"; file: string }
) & {
  event: "file_action";
  files: string[];
  count?: number;
  project?: string;
  dest?: string;
};

export type SystemEvent = { event: ""; by: string };
