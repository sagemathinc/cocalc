/*
Edit a cloud filesystem definition.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import { getCloudFilesystem } from "./index";
import type { EditCloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";

const logger = getLogger("server:compute:cloud-filesystem/edit");

interface Options extends EditCloudFilesystem {
  account_id: string;
}

const FIELDS =
  "project_id,account_id,mountpoint,mount,port,configuration,title,color,notes,lock".split(
    ",",
  );

export async function userEditCloudFilesystem(opts: Options) {
  logger.debug("userEditCloudFilesystem", opts);

  const { id, account_id } = opts;
  const cloudFilesystem = await getCloudFilesystem(id);
  if (cloudFilesystem.account_id != account_id) {
    const { name, email_address } = await getUser(account_id);
    throw Error(
      `only the owner of the cloud filesystem can edit it -- this volume is owned by ${name} - ${email_address}`,
    );
  }

  const push = (field, param) => {
    fields.push(field);
    params.push(param);
    dollars.push(`$${fields.length}`);
  };
  const fields: string[] = [];
  const params: any[] = [];
  const dollars: string[] = [];
  for (const field of FIELDS) {
    if (opts[field] != null) {
      push(field, opts[field]);
    }
  }
  const now = new Date();
  push("last_edited", now);

  const query = `UPDATE cloud_filesystems SET `;
  const pool = getPool();
  await pool.query(query, params);
}
