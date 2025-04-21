import { executeCode } from "@cocalc/backend/execute-code";
import { natsCoCalcUserEnv } from "@cocalc/backend/nats/cli";
import { backupStream, backupKV, backupProject } from "./backup";
import { restoreKV } from "./restore";

export async function rmStream(name: string) {
  // TODO: probably this should be done via the API
  await executeCode({
    command: "nats",
    args: ["stream", "rm", "-f", name],
    err_on_exit: true,
    env: natsCoCalcUserEnv(),
  });
}

export async function archiveStream(name: string) {
  const output = await backupStream(name);
  await rmStream(name);
  return output;
}

export async function rmKV(name: string) {
  // TODO: probably this should be done via the API
  await executeCode({
    command: "nats",
    args: ["kv", "del", "-f", name],
    err_on_exit: true,
    env: natsCoCalcUserEnv(),
  });
}

export async function archiveKV(name: string) {
  const output = await backupKV(name);
  await rmKV(name);
  return output;
}

export async function archiveProject({ project_id }: { project_id: string }) {
  const output = await backupProject({ project_id });
  const name = `project-${project_id}`;
  await rmKV(name);
  try {
    await rmStream(name);
  } catch (err) {
    // try to roll back to valid state:
    await restoreKV(name);
    throw err;
  }
  return output;
}
