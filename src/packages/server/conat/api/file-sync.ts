/*
Current permissions model:

src and dest must be of this form
    project-{project_id}:{path}
with account_id a collab on project_id.

There's one exception, which is when *deleting* a sync, the account_id only
has to be a collab on one or other of of src or dest.

*/

import { type Sync } from "@cocalc/conat/files/file-server";
import { type MutagenSyncSession } from "@cocalc/conat/project/mutagen/types";
import { assertCollab } from "./util";
import { client as fileServerClient } from "@cocalc/conat/files/file-server";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { resolve } from "node:path";

function getProjectId(spec: string): string {
  const name = spec.split(":")[0];
  if (!name.startsWith("project-")) {
    throw Error("volume name must start with project-");
  }
  const project_id = name.slice("project-".length);
  if (!isValidUUID(project_id)) {
    throw Error(`volume name must be of the form project-{valid uuid v4}`);
  }
  return project_id;
}

const COMMANDS = new Set(["flush", "reset", "pause", "resume", "terminate"]);

const BANNED_PATH_PREFIXES = [".local", ".cache", ".mutagen", ".snapshots"];

async function check({
  src,
  dest,
  account_id,
  onlyOne,
  command,
}: Sync & { account_id: string } & { onlyOne?: boolean } & {
  command?: string;
}) {
  if (command) {
    if (!COMMANDS.has(command)) {
      throw Error(`valid commands are: ${Array.from(COMMANDS).join(", ")}`);
    }
  }
  const project_id0 = getProjectId(src);
  const project_id1 = getProjectId(dest);
  if (!onlyOne) {
    await assertCollab({ project_id: project_id0, account_id });
    await assertCollab({ project_id: project_id1, account_id });
    return;
  }
  if (
    (await isCollaborator({ project_id: project_id0, account_id })) ||
    (await isCollaborator({ project_id: project_id1, account_id }))
  ) {
    return;
  } else {
    throw Error("must be a collaborator on src or dest");
  }
}

function checkPath(spec: string): string[] {
  const i = spec.indexOf(":");
  if (i == -1) {
    throw Error("missing path");
  }
  const path = spec.slice(i + 1);
  if (path != resolve("/", path).slice(1)) {
    throw Error("invalid path -- must be resolved path relative to HOME");
  }
  if (path == "" || path == "." || path == "..") {
    throw Error("invalid path -- can't be full HOME");
  }
  for (const banned of BANNED_PATH_PREFIXES) {
    if (path == banned || path.startsWith(banned + "/")) {
      throw Error(`path must not start with '${banned}'`);
    }
  }
  if (path == ".ssh") {
    return ["/.cocalc"];
  } else {
    return [];
  }
}

export async function create(
  opts: Sync & { account_id: string; ignores?: string[] },
): Promise<void> {
  await check(opts);
  const ignores = checkPath(opts.src)
    .concat(checkPath(opts.dest))
    .concat(opts.ignores ?? []);
  await fileServerClient().createSync({ ...opts, ignores });
}

export async function get(
  opts: Sync & { account_id: string },
): Promise<undefined | (MutagenSyncSession & Sync)> {
  await check(opts);
  return await fileServerClient().getSync(opts);
}

export async function command(
  opts: Sync & {
    account_id: string;
    command: "flush" | "reset" | "pause" | "resume" | "terminate";
  },
): Promise<{ stdout: string; stderr: string; exit_code: number }> {
  await check(opts);
  return await fileServerClient().syncCommand(opts.command, opts);
}

export async function getAll({
  name,
  account_id,
}: {
  name: string;
  account_id: string;
}): Promise<(MutagenSyncSession & Sync)[]> {
  const project_id = getProjectId(name + ":");
  await assertCollab({ project_id, account_id });
  return await fileServerClient().getAllSyncs({ name });
}
