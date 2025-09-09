import { conat } from "@cocalc/backend/conat";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { patchesStreamName } from "@cocalc/conat/sync/synctable-stream";
import { type Patch } from "@cocalc/conat/hub/api/sync";

export async function history({
  account_id,
  project_id,
  path,
  start_seq = 0,
  end_seq,
}: {
  account_id?: string;
  project_id: string;
  path: string;
  start_seq?: number;
  end_seq?: number;
}): Promise<{ patches: Patch[] }> {
  if (!account_id || !(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be collaborator on source project");
  }

  const client = conat();
  const name = patchesStreamName({ project_id, path });
  const astream = client.sync.astream({
    name,
    project_id,
    noInventory: true,
  });
  const patches: Patch[] = [];
  for await (const patch of await astream.getAll({
    start_seq,
    end_seq,
  })) {
    patches.push(patch as any);
  }
  return { patches };
}
