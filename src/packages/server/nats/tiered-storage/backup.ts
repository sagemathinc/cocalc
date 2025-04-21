import { executeCode } from "@cocalc/backend/execute-code";
import { natsBackup } from "@cocalc/backend/data";
import { join } from "path";
import mkdirp from "mkdirp";
import { natsCoCalcUserEnv } from "@cocalc/backend/nats/cli";

export async function backupStream(name: string) {
  await mkdirp(natsBackup);
  const { stdout, stderr } = await executeCode({
    command: "nats",
    args: [
      "stream",
      "backup",
      "--no-progress",
      "--no-consumers",
      name,
      join(natsBackup, name),
    ],
    err_on_exit: true,
    env: natsCoCalcUserEnv(),
  });
  return `${stdout}\n${stderr}`;
}

export async function backupKV(name: string) {
  return await backupStream(`KV_${name}`);
}
