import { executeCode } from "@cocalc/backend/execute-code";
import { natsBackup } from "@cocalc/backend/data";
import { join } from "path";
import mkdirp from "mkdirp";
import { natsCoCalcUserEnv } from "@cocalc/backend/nats/cli";
import { rmKV, rmStream } from "./archive";
import { exists } from "@cocalc/backend/misc/async-utils-node";

export async function restoreStream(name: string) {
  if (!(await exists(join(natsBackup, name, "backup.json")))) {
    // no data about this stream - non-fatal, since this is how
    // we backup never-created streams... and what else are we
    // going to do?
    return;
  }
  await mkdirp(natsBackup);
  const { stdout, stderr } = await executeCode({
    command: "nats",
    args: ["stream", "restore", "--no-progress", join(natsBackup, name)],
    err_on_exit: true,
    env: natsCoCalcUserEnv(),
  });
  return `${stderr}\n${stdout}`;
}

export async function restoreKV(name: string) {
  return await restoreStream(`KV_${name}`);
}

export async function restoreLocation({
  user_id,
  type,
  force,
}: {
  user_id: string;
  type: "account" | "project";
  force?: boolean;
}) {
  const name = `${type}-${user_id}`;
  if (force) {
    try {
      await rmKV(name);
    } catch (err) {
      console.log(`${err}`);
    }
    try {
      await rmStream(name);
    } catch (err) {
      console.log(`${err}`);
    }
  }
  await restoreKV(name);
  await restoreStream(name);
}

export async function restoreProject({
  project_id,
  force,
}: {
  project_id: string;
  force?: boolean;
}) {
  return await restoreLocation({ user_id: project_id, type: "project", force });
}

export async function restoreAccount({
  account_id,
  force,
}: {
  account_id: string;
  force?: boolean;
}) {
  return await restoreLocation({ user_id: account_id, type: "account", force });
}
