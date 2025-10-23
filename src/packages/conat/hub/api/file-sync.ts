/*
Synchronization of path between projects.

This code manages bidirectional synchronization of one path in one project
with another path in a different project.

Sync is done entirely within the fileserver, but then propagates to
running projects, of course.

APPLICATIONS:

- if you want somebody to edit one path but not have full access to the
  contents of a project, make a new project for them, then sync that path
  into the new project.

- share common files between several projects (e.g., your ~/bin) and have them
  update everywhere when you change one.

- share data file or a software install with a group of users or projects
*/

import { authFirstRequireAccount } from "./util";
import { type Sync } from "@cocalc/conat/files/file-server";
import { type MutagenSyncSession } from "@cocalc/conat/project/mutagen/types";

export const fileSync = {
  create: authFirstRequireAccount,
  getAll: authFirstRequireAccount,
  get: authFirstRequireAccount,
  command: authFirstRequireAccount,
};

export interface FileSync {
  create: (
    opts: Sync & { account_id: string; ignores?: string[] },
  ) => Promise<void>;
  get: (
    sync: Sync & { account_id: string },
  ) => Promise<undefined | (MutagenSyncSession & Sync)>;
  command: (
    sync: Sync & {
      account_id: string;
      command: "flush" | "reset" | "pause" | "resume" | "terminate";
    },
  ) => Promise<{ stdout: string; stderr: string; exit_code: number }>;
  getAll: (opts: {
    name: string;
    account_id: string;
  }) => Promise<(MutagenSyncSession & Sync)[]>;
}
