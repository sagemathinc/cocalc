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

import { delete_files } from "@cocalc/backend/files/delete-files";

export async function deleteFiles({ paths }: { paths: string[] }) {
  return await delete_files(paths);
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
