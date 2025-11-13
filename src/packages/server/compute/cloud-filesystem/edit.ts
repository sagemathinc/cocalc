/*
Edit a cloud file system definition.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import { getCloudFilesystem } from "./index";
import type { EditCloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import {
  CHANGE_MOUNTED,
  CHANGE_UNMOUNTED,
  assertValidPath,
} from "@cocalc/util/db-schema/cloud-filesystems";
import { isEqual } from "lodash";
import { len } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { setDefaultStorageClass } from "@cocalc/server/compute/cloud/google-cloud/storage";
import { getAvailableProjectSpecificId } from "./create";

const logger = getLogger("server:compute:cloud-filesystem:edit");

interface Options extends EditCloudFilesystem {
  account_id: string;
}

export const FIELDS = new Set(
  Array.from(CHANGE_MOUNTED).concat(Array.from(CHANGE_UNMOUNTED)),
);

// Returns changes that were actually made as an object
export async function userEditCloudFilesystem(
  opts: Options,
): Promise<Partial<Options>> {
  logger.debug("userEditCloudFilesystem", opts);

  const { id, account_id } = opts;
  const changes = { ...opts } as Partial<Options> & {
    project_specific_id?: number;
  };
  delete changes.id;
  delete changes.account_id;
  const cloudFilesystem = await getCloudFilesystem(id);
  if (cloudFilesystem.account_id != account_id) {
    const { name, email_address } = await getUser(account_id);
    throw Error(
      `only the owner of the cloud file system can edit it -- this volume is owned by ${name} - ${email_address}`,
    );
  }

  for (const field in changes) {
    if (
      changes[field] == null ||
      isEqual(changes[field], cloudFilesystem[field])
    ) {
      delete changes[field];
      continue;
    }
    if (!FIELDS.has(field)) {
      throw Error(
        `cannot change field '${field}' of cloud file system after it is created'`,
      );
    }
  }

  if (len(changes) == 0) {
    // nothing to do
    return {};
  }

  if (cloudFilesystem.mount) {
    for (const field in changes) {
      if (!CHANGE_MOUNTED.has(field)) {
        throw Error(
          `can only change '${field}' when cloud file system is not mounted - ${JSON.stringify(
            changes,
          )}`,
        );
      }
    }
  }

  if (changes.project_id) {
    // can only move storage to a project that user is a collab on
    if (
      !(await isCollaborator({ project_id: changes.project_id, account_id }))
    ) {
      throw Error(
        "can only move cloud file system to a project that user is a collaborator on",
      );
    }
    // also when moving to a different project we have to re-allocate
    // the project_specific_id, since the current one is probably not be valid!
    changes.project_specific_id = await getAvailableProjectSpecificId(
      changes.project_id,
    );
  }

  if (changes.mountpoint) {
    assertValidPath(changes.mountpoint);
  }

  if (changes.bucket_storage_class) {
    // set the new storage class
    if (cloudFilesystem.bucket) {
      await setDefaultStorageClass({
        bucketName: cloudFilesystem.bucket,
        storageClass: changes.bucket_storage_class,
      });
    }
  }

  const params: any[] = [];
  const items: string[] = [];
  const push = (field, param) => {
    params.push(param);
    const dollar = `$${items.length + 1}`;
    items.push(`${field}=${dollar}`);
  };
  for (const field of FIELDS) {
    if (changes[field] != null) {
      push(field, changes[field]);
    }
  }
  if (changes.project_specific_id) {
    push("project_specific_id", changes.project_specific_id);
  }
  push("last_edited", new Date());
  params.push(id);

  const query = `UPDATE cloud_filesystems SET ${items.join(",")} WHERE id=$${
    params.length
  }`;
  logger.debug("userEditCloudFilesystem", { query, params });
  const pool = getPool();
  await pool.query(query, params);

  return changes;
}
