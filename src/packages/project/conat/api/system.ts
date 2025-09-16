export async function ping() {
  return { now: Date.now() };
}

export async function terminate() {}

import { handleExecShellCode } from "@cocalc/project/exec_shell_code";
export { handleExecShellCode as exec };

export { realpath } from "@cocalc/project/browser-websocket/realpath";

import { version as versionNumber } from "@cocalc/util/smc-version";
export async function version() {
  return versionNumber;
}

import getListing from "@cocalc/backend/get-listing";
export async function listing({ path, hidden }) {
  return await getListing(path, hidden);
}

import { getClient } from "@cocalc/project/client";
async function setDeleted(path) {
  const client = getClient();
  await client.set_deleted(path);
}

import { move_files } from "@cocalc/backend/files/move-files";
export async function moveFiles({
  paths,
  dest,
}: {
  paths: string[];
  dest: string;
}) {
  await move_files(paths, dest, setDeleted);
}

import { rename_file } from "@cocalc/backend/files/rename-file";
export async function renameFile({ src, dest }: { src: string; dest: string }) {
  await rename_file(src, dest, setDeleted);
}

import { get_configuration } from "@cocalc/project/configuration";
export { get_configuration as configuration };

import { canonical_paths } from "../../browser-websocket/canonical-path";
export { canonical_paths as canonicalPaths };

import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { readFile, writeFile } from "fs/promises";

export async function writeTextFileToProject({
  path,
  content,
}: {
  path: string;
  content: string;
}): Promise<void> {
  await ensureContainingDirectoryExists(path);
  await writeFile(path, content);
}

export async function readTextFileFromProject({
  path,
}: {
  path: string;
}): Promise<string> {
  return (await readFile(path)).toString();
}

export async function signal({
  signal,
  pids,
  pid,
}: {
  signal: number;
  pids?: number[];
  pid?: number;
}): Promise<void> {
  const errors: Error[] = [];
  const f = (pid) => {
    try {
      process.kill(pid, signal);
    } catch (err) {
      errors.push(err);
    }
  };
  if (pid != null) {
    f(pid);
  }
  if (pids != null) {
    for (const pid of pids) {
      f(pid);
    }
  }
  if (errors.length > 0) {
    throw errors[errors.length - 1];
  }
}

import {
  start as startNamedServer,
  status as statusOfNamedServer,
} from "@cocalc/project/named-servers/control";
export { startNamedServer, statusOfNamedServer };

import { project_id, compute_server_id } from "@cocalc/project/data";
import ssh from "micro-key-producer/ssh.js";
import { randomBytes } from "micro-key-producer/utils.js";

export const sshKey = { fingerprint: "", publicKey: "", privateKey: "" };
export function initSshKey() {
  if (!sshKey.publicKey) {
    const seed = randomBytes(32);
    const key = ssh(seed, `project-${project_id}-${compute_server_id}`);
    for (const k in key) {
      if (k == "publicKeyBytes") continue;
      sshKey[k] = key[k];
    }
  }
}
export async function sshPublicKey(): Promise<string> {
  initSshKey();
  return sshKey.publicKey;
}
