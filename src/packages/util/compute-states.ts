/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { defineMessage } from "react-intl";

import { IntlMessage } from "./i18n/types";

// Compute related schema stuff (see compute.coffee)
//
// Here's a picture of the finite state machine defined below:
//
//                     ----------[closing] ------- --------- [stopping] <--------
//                    \|/                        \|/                           |
// [archived] <-->  [closed] --> [opening] --> [opened] --> [starting] --> [running]
//
//        [unarchiving]                       [pending]
//        [archiving]
//
//
// The icon names below refer to font-awesome, and are used in the UI.

export type State =
  | "archived"
  | "archiving"
  | "closed"
  | "closing"
  | "opened"
  | "opening"
  | "pending"
  | "running"
  | "starting"
  | "stopping"
  | "unarchiving";

// @hsy: completely unclear what this is for.
type Operation =
  | "open"
  | "archived"
  | "unarchive"
  | "start"
  | "stop"
  | "close"
  | "closed";

// These icon names must be a subset of the known names in frontend/componten/icon.tsx (we can't import IconName here, though)
export type ComputeStateIcon =
  | "file-archive"
  | "download"
  | "paper-plane"
  | "gears"
  | "stop"
  | "times-rectangle"
  | "flash"
  | "hand-stop"
  | "run";

export type ComputeState = {
  desc: IntlMessage; // shows up in the UI (default)
  desc_cocalccom?: IntlMessage; // if set, use this string instead of desc in "cocalc.com" mode
  icon: ComputeStateIcon;
  display: IntlMessage;
  stable?: boolean;
  to: { [key in Operation]?: State };
  timeout?: number;
  commands: Readonly<string[]>;
};

type ComputeStates = Readonly<{
  [key in State]: ComputeState;
}>;

// ATTN: in the frontend, all "display" and "desc" strings are translated in the components/project-state file.

export const COMPUTE_STATES: ComputeStates = {
  archived: {
    desc: defineMessage({
      id: "util.compute-states.archived.desc",
      defaultMessage:
        "Project is stored in longterm storage, and will take even longer to start.",
    }),
    icon: "file-archive",
    display: defineMessage({
      id: "util.compute-states.archived.display",
      defaultMessage: "Archived", // displayed name for users
    }),
    stable: true,
    to: {
      closed: "unarchiving",
    },
    commands: ["unarchive"],
  },

  unarchiving: {
    desc: defineMessage({
      id: "util.compute-states.unarchiving.desc",
      defaultMessage:
        "Project is being copied from longterm storage; this may take several minutes depending on how many files you have.",
    }),
    icon: "download",
    display: defineMessage({
      id: "util.compute-states.unarchiving.display",
      defaultMessage: "Restoring",
    }),
    to: {},
    timeout: 30 * 60,
    commands: ["status", "mintime"],
  },

  archiving: {
    desc: defineMessage({
      id: "util.compute-states.archiving.desc",
      defaultMessage: "Project is being archived to longterm storage.",
    }),
    icon: "paper-plane",
    display: defineMessage({
      id: "util.compute-states.archiving.display",
      defaultMessage: "Archiving",
    }),
    to: {},
    timeout: 5 * 60,
    commands: ["status", "mintime"],
  },

  closed: {
    desc: defineMessage({
      id: "util.compute-states.closed.desc",
      defaultMessage:
        "Project is archived and needs to be decompressed, so it will take longer to start.",
    }),
    icon: "file-archive", // font awesome icon
    display: defineMessage({
      id: "util.compute-states.closed.display",
      defaultMessage: "Closed", // displayed name for users
    }),
    stable: true,
    to: {
      open: "opening",
      archived: "archiving",
    },
    commands: ["open", "move", "status", "destroy", "mintime", "archive"],
  },

  opening: {
    desc: defineMessage({
      id: "util.compute-states.opening.desc",
      defaultMessage:
        "Project is being imported; this may take several minutes depending on size.",
    }),
    icon: "gears",
    display: defineMessage({
      id: "util.compute-states.opening.display",
      defaultMessage: "Opening",
    }),
    to: {},
    timeout: 30 * 60,
    commands: ["status", "mintime"],
  },

  closing: {
    desc: defineMessage({
      id: "util.compute-states.closing.desc",
      defaultMessage: "Project is in the process of being closed.",
    }),
    icon: "download",
    display: defineMessage({
      id: "util.compute-states.closing.display",
      defaultMessage: "Closing",
    }),
    to: {},
    timeout: 5 * 60,
    commands: ["status", "mintime"],
  },

  opened: {
    desc: defineMessage({
      id: "util.compute-states.opened.desc",
      defaultMessage: "Project is available and ready to run.",
    }),
    icon: "stop",
    display: defineMessage({
      id: "util.compute-states.opened.display",
      defaultMessage: "Stopped",
    }),
    stable: true,
    to: {
      start: "starting",
      close: "closing",
    },
    commands: [
      "start",
      "close",
      "save",
      "copy_path",
      "mkdir",
      "directory_listing",
      "read_file",
      "network",
      "mintime",
      "disk_quota",
      "compute_quota",
      "status",
      "migrate_live",
      "ephemeral_state",
      "ephemeral_disk",
    ],
  },

  pending: {
    desc_cocalccom: defineMessage({
      id: "util.compute-states.pending.desc_cocalccom",
      defaultMessage:
        "Finding a place to run your project.  If nothing becomes available, reduce RAM or CPU, pay for members only hosting, or contact support.",
    }),
    desc: defineMessage({
      id: "util.compute-states.pending.desc",
      defaultMessage:
        "Finding a place to run your project. If nothing becomes available, contact your administrator.",
    }),
    icon: "times-rectangle",
    display: defineMessage({
      id: "util.compute-states.pending.display",
      defaultMessage: "Pending",
    }),
    stable: true,
    to: {
      stop: "stopping",
    },
    commands: ["stop"],
  },

  starting: {
    desc: defineMessage({
      id: "util.compute-states.starting.desc",
      defaultMessage: "Project is starting up.",
    }),
    icon: "flash",
    display: defineMessage({
      id: "util.compute-states.starting.display",
      defaultMessage: "Starting",
    }),
    to: {},
    timeout: 60,
    commands: [
      "save",
      "copy_path",
      "mkdir",
      "directory_listing",
      "read_file",
      "network",
      "mintime",
      "disk_quota",
      "compute_quota",
      "status",
    ],
  },

  stopping: {
    desc: defineMessage({
      id: "util.compute-states.stopping.desc",
      defaultMessage: "Project is stopping.",
    }),
    icon: "hand-stop",
    display: defineMessage({
      id: "util.compute-states.stopping.display",
      defaultMessage: "Stopping",
    }),
    timeout: 60,
    to: {},
    commands: [
      "save",
      "copy_path",
      "mkdir",
      "directory_listing",
      "read_file",
      "network",
      "mintime",
      "disk_quota",
      "compute_quota",
      "status",
    ],
  },

  running: {
    desc: defineMessage({
      id: "util.compute-states.running.desc",
      defaultMessage: "Project is running.",
    }),
    icon: "run",
    display: defineMessage({
      id: "util.compute-states.running.display",
      defaultMessage: "Running",
    }),
    stable: true,
    to: {
      stop: "stopping",
    },
    commands: [
      "stop",
      "save",
      "address",
      "copy_path",
      "mkdir",
      "directory_listing",
      "read_file",
      "network",
      "mintime",
      "disk_quota",
      "compute_quota",
      "status",
      "migrate_live",
    ],
  },
} as const;
