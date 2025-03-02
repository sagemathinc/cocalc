import { executeCode } from "@cocalc/backend/execute-code";
import { projectDataset } from "./names";
import { dbProject } from "./db";
import { context } from "./config";

export async function setQuota({
  project_id,
  namespace = context.namespace,
  quota,
}: {
  namespace?: string;
  project_id: string;
  quota: string;
}) {
  const { pool } = dbProject({ namespace, project_id });
  await executeCode({
    verbose: true,
    command: "sudo",
    args: [
      "zfs",
      "set",
      // refquota so snapshots don't count against the user
      `refquota=${quota}`,
      projectDataset({ pool, namespace, project_id }),
    ],
  });
}

export async function mountProject({
  project_id,
  namespace = context.namespace,
}: {
  namespace?: string;
  project_id: string;
}) {
  const { pool } = dbProject({ namespace, project_id });
  try {
    await executeCode({
      command: "sudo",
      args: ["zfs", "mount", projectDataset({ pool, namespace, project_id })],
    });
  } catch (err) {
    if (`${err}`.includes("already mounted")) {
      // fine
      return;
    }
    throw err;
  }
}

export async function unmountProject({
  project_id,
  namespace = context.namespace,
}: {
  namespace?: string;
  project_id: string;
}) {
  const { pool } = dbProject({ namespace, project_id });
  try {
    await executeCode({
      verbose: true,
      command: "sudo",
      args: ["zfs", "unmount", projectDataset({ pool, namespace, project_id })],
    });
  } catch (err) {
    if (`${err}`.includes("not currently mounted")) {
      // fine
    } else {
      throw err;
    }
  }
}
