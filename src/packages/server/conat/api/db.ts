import { db } from "@cocalc/database";
import userQuery from "@cocalc/database/user-query";
import { callback2 } from "@cocalc/util/async-utils";
import getPool from "@cocalc/database/pool";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { isValidUUID } from "@cocalc/util/misc";

export { userQuery };
export { fileUseTimes } from "./file-use-times";

export async function touch({
  account_id,
  project_id,
  path,
  action = "edit",
}: {
  account_id?: string;
  project_id?: string;
  path?: string;
  action?: string;
}): Promise<void> {
  const D = db();
  if (!account_id) {
    throw Error("account_id must be set");
  }
  if (!project_id) {
    await callback2(D.touch, { account_id, action });
    return;
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be collaborator on project");
  }
  // TODO: we also connect still (this will of course go away very soon!!)
  D.ensure_connection_to_project?.(project_id);
  await callback2(D.touch, { account_id, project_id, path, action });
}

export async function getLegacyTimeTravelInfo({
  account_id,
  project_id,
  path,
}: {
  account_id: string;
  project_id: string;
  path: string;
}): Promise<{ uuid: string; users?: string[] }> {
  const pool = getPool("long");
  const D = db();
  const string_id = D.sha1(project_id, path);
  const { rows } = await pool.query(
    "SELECT archived as uuid, users FROM syncstrings WHERE string_id=$1 AND archived IS NOT NULL",
    [string_id],
  );
  const uuid = rows[0]?.uuid;
  if (!uuid) {
    // don't worry about auth if there's no info -- just save a little work
    // in this VERY common case.
    return { uuid: "" };
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("must be collaborator on project");
  }
  return { uuid, users: rows[0]?.users };
}

export async function getLegacyTimeTravelPatches({
  account_id,
  uuid,
}: {
  account_id: string;
  uuid: string;
}): Promise<string> {
  // only restriction on getting a blob when you know the sha1 uuid is
  // that you are signed in.
  if (!account_id) {
    throw Error("you must be signed in");
  }
  const D = db();
  const blob = await callback2(D.get_blob, { uuid });
  // we do NOT de-json this - leave it to the browser client to do that hard work...
  return blob.toString();
}

export async function removeBlobTtls({ uuids }: { uuids: string[] }) {
  const pool = getPool();
  const v = uuids.filter(isValidUUID);
  if (v.length > 0) {
    await pool.query("UPDATE blobs SET expire=NULL WHERE id::UUID=ANY($1::UUID[])", [v]);
  }
}
