/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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

export const COMPUTE_STATES = {
  archived: {
    desc: "Project is stored in longterm storage, and will take even longer to start.",
    icon: "file-archive",
    display: "Archived", // displayed name for users
    stable: true,
    to: {
      closed: "unarchiving",
    },
    commands: ["unarchive"],
  },

  unarchiving: {
    desc: "Project is being copied from longterm storage; this may take several minutes depending on how many files you have.",
    icon: "globe",
    display: "Unarchiving",
    to: {},
    timeout: 30 * 60,
    commands: ["status", "mintime"],
  },

  archiving: {
    desc: "Project is being moved to longterm storage.",
    icon: "paper-plane",
    display: "Archiving",
    to: {},
    timeout: 5 * 60,
    commands: ["status", "mintime"],
  },

  closed: {
    desc: "Project is stored only as ZFS streams, which must be imported, so it will take longer to start.",
    icon: "file-archive", // font awesome icon
    display: "Closed", // displayed name for users
    stable: true,
    to: {
      open: "opening",
      archived: "archiving",
    },
    commands: ["open", "move", "status", "destroy", "mintime", "archive"],
  },

  opening: {
    desc: "Project is being imported; this may take several minutes depending on size and history.",
    icon: "gears",
    display: "Opening",
    to: {},
    timeout: 30 * 60,
    commands: ["status", "mintime"],
  },

  closing: {
    desc: "Project is in the process of being closed.",
    icon: "close",
    display: "Closing",
    to: {},
    timeout: 5 * 60,
    commands: ["status", "mintime"],
  },

  opened: {
    desc: "Project is available and ready to try to run.",
    icon: "stop",
    display: "Stopped",
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
    desc: "Finding a place to run your project.  If nothing becomes available, reduce dedicated RAM or CPU, pay for members only hosting, or contact support.",
    icon: "times-rectangle",
    display: "Pending",
    stable: true,
    to: {
      stop: "stopping",
    },
    command: ["stop"],
  },

  starting: {
    desc: "Project is starting up.",
    icon: "flash",
    display: "Starting",
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
    desc: "Project is stopping.",
    icon: "hand-stop",
    display: "Stopping",
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

  running: {
    desc: "Project is running.",
    icon: "run",
    display: "Running",
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

export type State = keyof typeof COMPUTE_STATES;
