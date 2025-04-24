import { executeCode } from "@cocalc/backend/execute-code";
import { natsBackup } from "@cocalc/backend/data";
import { join } from "path";
import mkdirp from "mkdirp";
import { natsCoCalcUserEnv } from "@cocalc/backend/nats/cli";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("tiered-storage:backup");

export async function backupStream(name: string) {
  logger.debug("backup stream", { name });
  await mkdirp(join(natsBackup, name));
  const { stdout, stderr, exit_code } = await executeCode({
    command: "nats",
    args: [
      "stream",
      "backup",
      "--no-progress",
      "--no-consumers",
      name,
      join(natsBackup, name),
    ],
    err_on_exit: false,
    env: { ...process.env, ...natsCoCalcUserEnv() },
  });
  if (exit_code) {
    if (stderr.includes("stream not found")) {
      return;
    } else {
      throw Error(stderr);
    }
  }
  return `${stdout}\n${stderr}`;
}

export async function backupKV(name: string) {
  return await backupStream(`KV_${name}`);
}

export async function backupLocation({
  user_id,
  type,
}: {
  user_id: string;
  type: "account" | "project";
}) {
  const name = `${type}-${user_id}`;
  await backupKV(name);
  await backupStream(name);
}

export async function backupProject({ project_id }: { project_id: string }) {
  return await backupLocation({ user_id: project_id, type: "project" });
}

export async function backupAccount({ account_id }: { account_id: string }) {
  return await backupLocation({ user_id: account_id, type: "account" });
}
