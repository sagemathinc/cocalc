import { executeCode } from "@cocalc/backend/execute-code";
import { natsBackup } from "@cocalc/backend/data";
import { join } from "path";
import mkdirp from "mkdirp";
import { natsCoCalcUserEnv } from "@cocalc/backend/nats/cli";
import { rmKV, rmStream } from "./archive";

export async function restoreStream(name: string) {
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

export async function restoreProject({
  project_id,
  force,
}: {
  project_id: string;
  force?: boolean;
}) {
  const name = `project-${project_id}`;
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
