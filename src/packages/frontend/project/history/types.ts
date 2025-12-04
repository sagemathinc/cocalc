/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";

import { TypedMap } from "@cocalc/frontend/app-framework";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";

import type { ComputeServerEvent } from "@cocalc/util/compute/log";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";

import type { Mode as JupyterCellLLMMode } from "@cocalc/frontend/jupyter/llm/cell-tool";
import { Ext } from "@cocalc/frontend/project/page/home-page/ai-generate-examples";

export type EventRecord = {
  id: string;
  event: TypedMap<ProjectEvent>;
  account_id: string;
  project_id?: string;
  time?: Date;
};

export type EventRecordMap = TypedMap<EventRecord>;

export type ProjectLogMap = Map<string, EventRecordMap>;

/**
 * Comprehensive list of all event types loggable to a project
 * All events must have an event field
 */
export type ProjectEvent =
  | UnknownEvent
  | AssistantEvent
  | ComputeServerEvent
  | ProjectControlEvent
  | FileActionEvent
  | LibraryEvent
  | LLMEvent
  | UpgradeEvent
  | PayAsYouGoUpgradeEvent
  | LicenseEvent
  | OpenFile
  | MiniTermEvent
  | CollaboratorEvent
  | X11Event
  | SetTitleEvent
  | SetDescriptionEvent
  | SetNameEvent
  | SetAvatarEvent
  | SoftwareEnvironmentEvent
  | PublicPathEvent
  | { event: "open_project" }
  | { event: "delete_project" }
  | { event: "undelete_project" }
  | { event: "hide_project" }
  | { event: "unhide_project" }
  | SystemEvent;

export function isUnknownEvent(event: ProjectEvent): event is UnknownEvent {
  return (event as any).event == null;
}

// there are problematic events in the DB, which aren't any of the entries below
// https://github.com/sagemathinc/cocalc/issues/5927
type UnknownEvent = {
  time: number;
};

export type SetTitleEvent = {
  event: "set";
  title: string;
};

export type SetDescriptionEvent = {
  event: "set";
  description: string;
};

export type SetNameEvent = {
  event: "set";
  name: string;
};

export type SetAvatarEvent = {
  event: "set";
  image: string; // the tiny image
};

export type X11Event = {
  event: "x11";
  action: "launch";
  command: string;
  path: string;
};

export type CollaboratorEvent =
  | {
      event: "invite_user" | "invite_nonuser" | "remove_collaborator";
      invitee_account_id?: string;
      invitee_email?: string;
      removed_name?: string;
    }
  | {
      event: "change_collaborator_type";
      target_account_id: string;
      target_name?: string;
      old_group: "owner" | "collaborator";
      new_group: "owner" | "collaborator";
    };

export type UpgradeEvent = {
  event: "upgrade";
  upgrades: any;
};

export type PayAsYouGoUpgradeEvent = {
  event: "pay-as-you-go-upgrade";
  quota: ProjectQuota;
};

export type LicenseEvent = {
  event: "license";
  action: "add" | "remove";
  license_id: string;
  title?: string;
  quota?: SiteLicenseQuota;
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

interface LLMEventBase {
  event: "llm";
  model?: string;
  path: string;
}

interface LLMEventJupyterCellButton extends LLMEventBase {
  usage: "jupyter-cell-button";
  mode?: JupyterCellLLMMode | null; // "jupyter-cell-buttons"
}

interface LLMEventJupyterCellGenerate extends LLMEventBase {
  usage: "jupyter-generate-cell";
}

interface LLMEventJupyterGenerateNotebook extends LLMEventBase {
  usage: "jupyter-generate-notebook";
}

interface LLMEvenGenerateDocument extends LLMEventBase {
  usage: "generate-document";
  ext: Ext;
}

export type LLMEvent =
  | LLMEventJupyterCellButton
  | LLMEventJupyterCellGenerate
  | LLMEventJupyterGenerateNotebook
  | LLMEvenGenerateDocument;

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
  // if true, opening a file that was deleted
  deleted?: number;
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
  duration_ms?: number;
};

export type FileActionEvent =
  | {
      event: "file_action";
      action: "renamed";
      src: string;
      dest: string;
      compute_server_id?: number;
    }
  | ((
      | { action: "deleted" }
      | { action: "downloaded" }
      | { action: "moved" }
      | {
          action: "copied";
          src_compute_server_id?: number;
          dest_compute_server_id?: number;
        }
      | { action: "shared" }
      | { action: "uploaded"; file: string }
      | { action: "created" }
    ) & {
      event: "file_action";
      files: string[];
      count?: number;
      project?: string;
      dest?: string;
      compute_server_id?: number;
    });

export type PublicPathEvent = {
  event: "public_path";
  path: string;
  unlisted?: boolean;
  disabled?: boolean;
  authenticated?: boolean;
  site_license_id?: string;
  redirect?: string;
  jupyter_api?: boolean;
};

export type SoftwareEnvironmentEvent = {
  event: "software_environment";
  previous: string;
  next: string;
};

export type SystemEvent = { event: ""; by: string };

export function to_search_string(event: ProjectEvent): string {
  let s: string = "";
  for (let k in event) {
    let val = event[k];
    if (k === "type" || k == "time" || k == "license_id" || k == "quota")
      continue;
    if (val == "file_action") continue;
    if (typeof val == "number") continue;
    if (typeof val != "string") {
      val = JSON.stringify(val); // e.g., array of paths
    }
    s += " " + val;
  }
  return s.toLowerCase();
}
