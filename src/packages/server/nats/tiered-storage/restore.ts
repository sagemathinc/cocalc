import { executeCode } from "@cocalc/backend/execute-code";
import { natsBackup } from "@cocalc/backend/data";
import { join } from "path";
import mkdirp from "mkdirp";
import { natsCoCalcUserEnv } from "@cocalc/backend/nats/cli";

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
