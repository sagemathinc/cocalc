import { executeCode } from "@cocalc/backend/execute-code";
import { natsCoCalcUserEnv } from "@cocalc/backend/nats/cli";
import { backupStream, backupKV, backupLocation } from "./backup";
import { restoreKV } from "./restore";
import type { LocationType } from "./types";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("tiered-storage:archive");

export async function rmStream(name: string) {
  // TODO: probably this should be done via the API
  const { exit_code, stderr } = await executeCode({
    command: "nats",
    args: ["stream", "rm", "-f", name],
    err_on_exit: false,
    env: natsCoCalcUserEnv(),
  });
  if (exit_code) {
    if (stderr.includes("stream not found")) {
      return;
    }
    throw Error(stderr);
  }
}

export async function archiveStream(name: string) {
  logger.debug("archive", { name });
  const output = await backupStream(name);
  await rmStream(name);
  return output;
}

export async function rmKV(name: string) {
  // TODO: probably this should be done via the API
  const { exit_code, stderr } = await executeCode({
    command: "nats",
    args: ["kv", "del", "-f", name],
    err_on_exit: false,
    env: natsCoCalcUserEnv(),
  });
  if (exit_code) {
    if (stderr.includes("bucket not found")) {
      return;
    }
    throw Error(stderr);
  }
}

export async function archiveKV(name: string) {
  const output = await backupKV(name);
  await rmKV(name);
  return output;
}

export async function archiveLocation({
  user_id,
  type,
}: {
  user_id: string;
  type: LocationType;
}) {
  const output = await backupLocation({ user_id, type });
  const name = `${type}-${user_id}`;
  await rmKV(name);
  try {
    await rmStream(name);
  } catch (err) {
    // try to roll back to valid state:
    logger.debug(
      `unexpected error archiving -- attempting roll back -- ${err} `,
      {
        name,
      },
    );
    await restoreKV(name);
    throw err;
  }
  return output;
}

export async function archiveProject({ project_id }: { project_id: string }) {
  return await archiveLocation({ user_id: project_id, type: "project" });
}

export async function archiveAccount({ account_id }: { account_id: string }) {
  return await archiveLocation({ user_id: account_id, type: "account" });
}
