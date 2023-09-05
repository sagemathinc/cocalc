/*
Create a compute server and returns the numerical id of that server.

This just makes a record in a database.  It doesn't check anything in any remote api's
are start anything running.  That's handled elsewhere.

It's of course easy to make a compute serve that can't be started due to invalid parameters.
*/

import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";

import type { Cloud, GPU, CPU } from "@cocalc/util/db-schema/compute-servers";

interface Options {
  project_id: string;
  name?: string;
  created_by: string;
  color?: string;
  idle_timeout?: number;
  autorestart?: number;
  cloud?: Cloud;
  gpu?: GPU;
  gpu_count?: number;
  cpu?: CPU;
  cpu_count?: number;
  memory?: number;
  spot?: boolean;
}

const FIELDS =
  "project_id,name,created_by,color,idle_timeout,autorestart,cloud,gpu,gpu_count,cpu,cpu_count,memory,spot".split(
    ",",
  );

export default async function createComputeServer(
  opts: Options,
): Promise<number> {
  if (!isValidUUID(opts.created_by)) {
    throw Error("created_by must be a valid uuid");
  }
  if (!isValidUUID(opts.project_id)) {
    throw Error("project_id must be a valid uuid");
  }
  const pool = getPool();

  const fields: string[] = [];
  const params: any[] = [];
  const dollars: string[] = [];
  for (const field of FIELDS) {
    if (opts[field] != null) {
      fields.push(field);
      params.push(opts[field]);
      dollars.push(`$${fields.length}`);
    }
  }

  const query = `INSERT INTO compute_servers(${fields.join(
    ",",
  )}) VALUES(${dollars.join(",")}) RETURNING id`;
  const { rows } = await pool.query(query, params);
  const { id } = rows[0];
  return id;
}
