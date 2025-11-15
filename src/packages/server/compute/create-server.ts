/*
Create a compute server and returns the numerical id of that server.

This just makes a record in a database.  It doesn't check anything in any remote api's
are start anything running.  That's handled elsewhere.

It's of course easy to make a compute serve that can't be started due to invalid parameters.
*/

import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { CLOUDS_BY_NAME } from "@cocalc/util/db-schema/compute-servers";
import { isDnsAvailable } from "./dns";
import { getAvailableVpnIp } from "./vpn";
import { getProjectSpecificId } from "./project-specific-id";
import { nanoid } from "nanoid";
import getLogger from "@cocalc/backend/logger";
import { checkValidDomain } from "@cocalc/util/compute/dns";

const logger = getLogger("server:compute:create-server");

import type {
  Cloud,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";

interface Options {
  account_id?: string;
  project_id: string;
  cloud?: Cloud;
  configuration?: Configuration;
  title?: string;
  color?: string;
  autorestart?: boolean;
  position?: number;
  notes?: string;
  course_project_id?: string;
  course_server_id?: number;
}

const FIELDS =
  "project_id,title,account_id,color,autorestart,cloud,configuration,position,notes,lock,course_project_id,course_server_id".split(
    ",",
  );

export default async function createServer(opts: Options): Promise<number> {
  logger.debug("createServer", opts);
  if (!isValidUUID(opts.account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  if (!isValidUUID(opts.project_id)) {
    throw Error("project_id must be a valid uuid");
  }
  if (!(await isCollaborator(opts))) {
    throw Error("user must be a collaborator on project");
  }
  if (opts.course_project_id != null && !isValidUUID(opts.course_project_id)) {
    throw Error("if given, course_project_id must be a valid uuid");
  }
  if (opts.configuration != null) {
    if (opts.configuration.cloud != opts.cloud) {
      throw Error(
        `configuration must be for the same cloud: configuration.cloud='${opts.configuration.cloud}' != '${opts.cloud}'`,
      );
    }
  }

  if (opts.configuration?.dns) {
    // dns is NOT case sensitive, so just in case, we make sure.
    opts.configuration.dns = opts.configuration.dns.toLowerCase();
    if (!(await isDnsAvailable(opts.configuration.dns))) {
      checkValidDomain(opts.configuration.dns);
      // this should never happen due to frontend UI preventing it, etc.
      // however -- just in case -- make it work robustly by adding some random string.
      let n = 0;
      while (true) {
        const dns = `${opts.configuration.dns}-${nanoid(6).toLowerCase()}`;
        if (await isDnsAvailable(dns)) {
          opts.configuration.dns = dns;
          break;
        }
        n += 1;
        if (n > 25) {
          // really weird bug if this doesn't work immediately... but if configuration.dns itself was invalid
          // it would fail, though we do check that above.  In any case, nobody wants an infinite loop on
          // their server, so put this here.
          throw Error(
            `Subdomain '${opts.configuration.dns}' is not available.  Please change 'DNS: Custom Subdomain' and select a different subdomain.`,
          );
        }
      }
    }
  }

  if (opts.position == null) {
    opts.position = await getPositionAtTop(opts.project_id);
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
    } else if (
      field == "configuration" &&
      opts.cloud &&
      CLOUDS_BY_NAME[opts.cloud]?.defaultConfiguration
    ) {
      push("configuration", CLOUDS_BY_NAME[opts.cloud].defaultConfiguration);
    }
  }
  push("state", "deprovisioned");
  const now = new Date();
  push("last_edited", now);
  push("created", now);
  push("vpn_ip", await getAvailableVpnIp(opts.project_id));

  const query = `INSERT INTO compute_servers(${fields.join(
    ",",
  )}) VALUES(${dollars.join(",")}) RETURNING id`;
  const pool = getPool();
  const { rows } = await pool.query(query, params);
  const { id } = rows[0];

  // set the project_specific_id properly for this new compute server
  await getProjectSpecificId({
    compute_server_id: id,
    project_id: opts.project_id,
  });

  return id;
}

async function getPositionAtTop(project_id: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(number)+1, 0) AS result
FROM (
  SELECT id AS number FROM compute_servers WHERE project_id=$1
  UNION ALL
  SELECT position AS number FROM compute_servers WHERE position IS NOT NULL AND project_id=$1
) AS numbers`,
    [project_id],
  );
  return rows[0].result;
}
