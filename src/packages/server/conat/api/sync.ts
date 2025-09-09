import { conat } from "@cocalc/backend/conat";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { patchesStreamName } from "@cocalc/conat/sync/synctable-stream";

export async function history({
  account_id,
  project_id,
  path,
  start_seq = 0,
}: {
  account_id?: string;
  project_id: string;
  path: string;
  start_seq: number;
}): Promise<any[]> {
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
  const patches: {
    seq: number;
    time: number;
    mesg: {
      time: number;
      wall: number;
      patch: string;
      user_id: number;
      is_snapshot?: boolean;
      parents: number[];
      version?: number;
    };
  }[] = [];
  for await (const patch of await astream.getAll({ start_seq })) {
    patches.push(patch);
  }
  return { patches };
}
