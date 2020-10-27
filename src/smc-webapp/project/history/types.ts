/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { TypedMap } from "../../app-framework";

export type EventRecord = {
  id: string;
  event: TypedMap<ProjectEvent>;
  account_id: string;
  project_id?: string;
  time: Date;
};

export type EventRecordMap = TypedMap<EventRecord>;

export type ProjectLogMap = Map<string, EventRecordMap>;

/**
 * Comprehensive list of all event types loggable to a project
 * All events must have an event field
 */
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
  | SetTitleEvent
  | SetDescriptionEvent
  | { event: "open_project" }
  | SystemEvent;

export type SetTitleEvent = {
  event: "set";
  title: string;
};

export type SetDescriptionEvent = {
  event: "set";
  description: string;
};

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
  action: "copy";
  target?: string;
  title: string;
  docid?: string;
  source: string;
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
  action: "open";
  filename: string;
  time?: number;
  type?: string;
};

export type ProjectControlEvent = {
  event:
    | "start_project"
    | "project_stop_requested"
    | "project_start_requested"
    | "project_restart_requested"
    | "project_stopped"
    | "project_started";
  time?: number;
};

export type FileActionEvent = (
  | { action: "deleted" }
  | { action: "downloaded"; files?: string[] }
  | { action: "moved" }
  | { action: "copied" }
  | { action: "shared" }
  | { action: "uploaded"; file: string }
  | { action: "created" }
) & {
  event: "file_action";
  files: string[];
  count?: number;
  project?: string;
  dest?: string;
};

export type SystemEvent = { event: ""; by: string };
