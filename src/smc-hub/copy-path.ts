/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Copy Operations Provider
// Used in the "Client"

const access = require("./access");
import { callback2 } from "smc-util/async-utils";
import * as message from "smc-util/message";
const { one_result } = require("./postgres");
import { is_valid_uuid_string, to_json } from "smc-util/misc";
import { ProjectControlFunction } from "smc-hub/servers/project-control";

type WhereQueries = ({ [query: string]: string } | string)[];

interface CopyOp {
  copy_path_id: any;
  time: any;
  source_project_id: any;
  source_path: any;
  target_project_id: any;
  target_path: any;
  overwrite_newer: any;
  delete_missing: any;
  backup: any;
  started: any;
  finished: any;
  scheduled: any;
  error: any;
}

// this is specific to queries built here
function sanitize(
  val: number | string,
  deflt: number,
  max: number,
  name
): number {
  if (val != null) {
    const o = typeof val == "string" ? parseInt(val) : val;
    if (isNaN(o) || o < 0 || o > max) {
      throw new Error(
        `ILLEGAL VALUE ${name}='${val}' (must be in [0, ${max}])`
      );
    }
    return o;
  } else {
    return deflt;
  }
}

// thrown errors are an object, but the response needs a string
function err2str(err: string | { message?: string }) {
  if (typeof err === "string") {
    return err;
  } else if (err.message != null) {
    return err.message;
  } else {
    return `ERROR: ${to_json(err)}`;
  }
}

// transforms copy_op data from the database to the specific object we want to return
function row_to_copy_op(copy_op): CopyOp {
  return {
    copy_path_id: copy_op.id,
    time: copy_op.time,
    source_project_id: copy_op.source_project_id,
    source_path: copy_op.source_path,
    target_project_id: copy_op.target_project_id,
    target_path: copy_op.target_path,
    overwrite_newer: copy_op.overwrite_newer,
    delete_missing: copy_op.delete_missing,
    backup: copy_op.backup,
    started: copy_op.started,
    finished: copy_op.finished,
    scheduled: copy_op.scheduled,
    error: copy_op.error,
  };
}

export class CopyPath {
  private client: any;
  private dbg: (method: string) => (msg: string) => void;
  private err: (method: string) => (msg: string) => void;
  private throw: (msg: string) => void;

  constructor(client) {
    this.client = client;
    this._init_errors();
    this.copy = this.copy.bind(this);
    this.status = this.status.bind(this);
    this.delete = this.delete.bind(this);
    this._status_query = this._status_query.bind(this);
    this._status_single = this._status_single.bind(this);
    this._get_status = this._get_status.bind(this);
    this._read_access = this._read_access.bind(this);
    this._write_access = this._write_access.bind(this);
  }

  private _init_errors(): void {
    // client.dbg returns a function
    this.dbg = function (method: string): (msg: string) => void {
      return this.client.dbg(`CopyPath::${method}`);
    };
    this.err = function (method: string): (msg: string) => void {
      return (msg) => {
        throw new Error(`CopyPath::${method}: ${msg}`);
      };
    };
    this.throw = (msg: string) => {
      throw new Error(msg);
    };
  }

  async copy(mesg): Promise<void> {
    this.client.touch();

    try {
      // prereq checks
      if (!is_valid_uuid_string(mesg.src_project_id)) {
        this.throw(`src_project_id='${mesg.src_project_id}' not valid`);
      }
      if (!is_valid_uuid_string(mesg.target_project_id)) {
        this.throw(`target_project_id='${mesg.target_project_id}' not valid`);
      }
      if (mesg.src_path == null) {
        this.throw("src_path must be defined");
      }

      // check read/write access
      const write = this._write_access(mesg.target_project_id);
      const read = this._read_access(mesg.src_project_id);
      await Promise.all([write, read]);

      // get the "project" for issuing commands
      const projectControl: ProjectControlFunction = this.client.compute_server;
      const project = await projectControl(mesg.src_project_id);

      // do the copy
      const copy_id = await project.copyPath({
        path: mesg.src_path,
        target_project_id: mesg.target_project_id,
        target_path: mesg.target_path,
        overwrite_newer: mesg.overwrite_newer,
        delete_missing: mesg.delete_missing,
        backup: mesg.backup,
        timeout: mesg.timeout,
        wait_until_done: mesg.wait_until_done,
        scheduled: mesg.scheduled,
      });

      // if we're still here, the copy was ok!
      if (copy_id != null) {
        // we only expect a copy_id in kucalc mode
        const resp = message.copy_path_between_projects_response({
          id: mesg.id,
          copy_path_id: copy_id,
        });
        this.client.push_to_client(resp);
      } else {
        this.client.push_to_client(message.success({ id: mesg.id }));
      }
    } catch (err) {
      this.client.error_to_client({ id: mesg.id, error: err2str(err) });
    }
  }

  async status(mesg): Promise<void> {
    this.client.touch();
    //const dbg = this.dbg("status");
    // src_project_id, target_project_id and optionally src_path + offset (limit is 1000)
    const search_many =
      mesg.src_project_id != null || mesg.target_project_id != null;
    if (!search_many && mesg.copy_path_id == null) {
      this.client.error_to_client({
        id: mesg.id,
        error:
          "'copy_path_id' (UUID) of a copy operation or 'src_project_id/target_project_id' must be defined",
      });
      return;
    }
    if (search_many) {
      await this._status_query(mesg);
    } else {
      await this._status_single(mesg);
    }
  }

  private async _status_query(mesg): Promise<void> {
    const dbg = this.dbg("status_query");
    const err = this.err("status_query");

    try {
      // prereq checks -- at least src or target must be set
      if (mesg.src_project_id == null && mesg.target_project_id == null) {
        // serious error: this should never happen, actually
        err(
          `At least one of "src_project_id" or "target_project_id" must be given!`
        );
      }

      // constructing the query
      const where: WhereQueries = [];

      if (mesg.src_project_id != null) {
        await this._read_access(mesg.src_project_id);
        where.push({ "source_project_id = $::UUID": mesg.src_project_id });
      }
      if (mesg.target_project_id != null) {
        await this._write_access(mesg.target_project_id);
        where.push({ "target_project_id = $::UUID": mesg.target_project_id });
      }

      if (mesg.src_path != null) {
        where.push({ "source_path = $": mesg.src_path });
      }

      // all failed ones are implicitly also finished
      if (mesg.failed === true || mesg.failed === "true") {
        where.push("error IS NOT NULL");
        mesg.pending = false;
      }

      if (mesg.pending === true || mesg.pending === "true") {
        where.push("finished IS NULL");
      } else {
        where.push("finished IS NOT NULL");
      }

      // … and also sanitizing input!
      const offset = sanitize(mesg.offset, 0, 100 * 1000, "offset");
      const limit = sanitize(mesg.limit, 1000, 1000, "limit");
      dbg(`offset=${offset}   limit=${limit}`);

      // essentially, we want to fill up and return this array
      const copy_ops: CopyOp[] = [];

      const status_data = await callback2(this.client.database._query, {
        query: "SELECT * FROM copy_paths",
        where,
        offset,
        limit,
        order_by: "time DESC", // most recent first
      });

      if (status_data == null) {
        this.throw(
          "Can't find copy operations for given src_project_id/target_project_id"
        );
      }
      for (const row of Array.from(status_data.rows)) {
        // be explicit about what we return
        copy_ops.push(row_to_copy_op(row));
      }

      // we're good
      this.client.push_to_client(
        message.copy_path_status_response({
          id: mesg.id,
          data: copy_ops,
        })
      );
    } catch (err) {
      this.client.error_to_client({ id: mesg.id, error: err2str(err) });
    }
  }

  private async _get_status(mesg): Promise<CopyOp | undefined> {
    if (mesg.copy_path_id == null) {
      this.throw("ERROR: copy_path_id missing");
    }

    const dbg = this.dbg("_get_status");

    const where: WhereQueries = [{ "id = $::UUID": mesg.copy_path_id }];
    // not_yet_done is set internally for deleting a scheduled copy op
    if (mesg.not_yet_done) {
      where.push("scheduled IS NOT NULL");
      where.push("finished IS NULL");
    }

    // get the status info
    const statuses = await callback2(this.client.database._query, {
      query: "SELECT * FROM copy_paths",
      where,
    });

    const copy_op: CopyOp = (() => {
      let copy_op;
      one_result((_, x) => {
        if (x == null) {
          if (mesg.not_yet_done) {
            this.throw(
              `Copy operation '${mesg.copy_path_id}' either does not exist or already finished`
            );
          } else {
            this.throw(
              `Can't find copy operation with ID=${mesg.copy_path_id}`
            );
          }
        } else {
          copy_op = x;
          dbg(`copy_op=${to_json(copy_op)}`);
        }
      })(undefined, statuses);
      return copy_op;
    })();

    if (copy_op == null) {
      this.throw(`Can't find copy operation with ID=${mesg.copy_path_id}`);
      return;
    }

    // check read/write access
    const write = this._write_access(copy_op.target_project_id);
    const read = this._read_access(copy_op.source_project_id);
    await Promise.all([write, read]);

    return copy_op;
  }

  private async _status_single(mesg): Promise<void> {
    try {
      const copy_op = await this._get_status(mesg);
      // be explicit about what we return
      const data = row_to_copy_op(copy_op);
      this.client.push_to_client(
        message.copy_path_status_response({ id: mesg.id, data })
      );
    } catch (err) {
      this.client.error_to_client({ id: mesg.id, error: err2str(err) });
    }
  }

  async delete(mesg): Promise<void> {
    this.client.touch();
    const dbg = this.dbg("delete");
    // this filters possible results
    mesg.not_yet_done = true;
    try {
      const copy_op = await this._get_status(mesg);

      if (copy_op == null) {
        this.client.error_to_client({
          id: mesg.id,
          error: `opy op '${mesg.copy_path_id}' cannot be deleted.`,
        });
      } else {
        await callback2(this.client.database._query, {
          query: "DELETE FROM copy_paths",
          where: { "id = $::UUID": mesg.copy_path_id },
        });
        // no error
        this.client.push_to_client(
          message.copy_path_status_response({
            id: mesg.id,
            data: `copy_path_id = '${mesg.copy_path_id}' deleted`,
          })
        );
      }
    } catch (err) {
      dbg(`stauts err=${err2str(err)}`);
      this.client.error_to_client({ id: mesg.id, error: err2str(err) });
    }
  }

  private async _read_access(src_project_id): Promise<boolean> {
    if (!is_valid_uuid_string(src_project_id)) {
      this.throw(`invalid src_project_id=${src_project_id}`);
    }

    const read_ok = await callback2(access.user_has_read_access_to_project, {
      project_id: src_project_id,
      account_id: this.client.account_id,
      account_groups: this.client.groups,
      database: this.client.database,
    });
    // this.dbg("_read_access")(read_ok);
    if (!read_ok) {
      this.throw(
        `ACCESS BLOCKED -- No read access to source project -- ${src_project_id}`
      );
      return false;
    }
    return true;
  }

  private async _write_access(target_project_id): Promise<boolean> {
    if (!is_valid_uuid_string(target_project_id)) {
      this.throw(`invalid target_project_id=${target_project_id}`);
    }

    const write_ok = await callback2(access.user_has_write_access_to_project, {
      database: this.client.database,
      project_id: target_project_id,
      account_id: this.client.account_id,
      account_groups: this.client.groups,
    });
    // this.dbg("_write_access")(write_ok);
    if (!write_ok) {
      this.throw(
        `ACCESS BLOCKED -- No write access to target project -- ${target_project_id}`
      );
      return false;
    }
    return true;
  }
}
