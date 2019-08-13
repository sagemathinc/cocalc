// Copy Path Provider
// Used in the "Client"

const async = require("async");
import { callback2 } from "smc-util/async-utils";
const message = require("smc-util/message");
const access = require("./access");
const misc = require("smc-util/misc");
const { one_result } = require("./postgres");

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

// this is specific to here
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
    error: copy_op.error
  };
}

export class CopyPath {
  private client: any;
  private dbg: (method: string) => (msg: string) => void;

  constructor(client) {
    this.client = client;
    // client.dbg returns a function
    this.dbg = function(method: string): (msg: string) => void {
      return this.client.dbg(`CopyPath::${method}`);
    };
    this.copy = this.copy.bind(this);
    this.status = this.status.bind(this);
    this.delete = this.delete.bind(this);
    this._status_query = this._status_query.bind(this);
    this._status_single = this._status_single.bind(this);
    this._get_status = this._get_status.bind(this);
  }

  copy(mesg) {
    this.client.touch();
    if (mesg.src_project_id == null) {
      this.client.error_to_client({
        id: mesg.id,
        error: "src_project_id must be defined"
      });
      return;
    }
    if (mesg.target_project_id == null) {
      this.client.error_to_client({
        id: mesg.id,
        error: "target_project_id must be defined"
      });
      return;
    }
    if (mesg.src_path == null) {
      this.client.error_to_client({
        id: mesg.id,
        error: "src_path must be defined"
      });
      return;
    }

    const locals = { copy_id: undefined };

    async.series(
      [
        (cb): void => {
          // Check permissions for the source and target projects (in parallel) --
          // need read access to the source and write access to the target.
          async.parallel(
            [
              (cb): void => {
                access.user_has_read_access_to_project({
                  project_id: mesg.src_project_id,
                  account_id: this.client.account_id,
                  account_groups: this.client.groups,
                  database: this.client.database,
                  cb: (err, result) => {
                    if (err) {
                      cb(err);
                    } else if (!result) {
                      cb(
                        `user must have read access to source project ${
                          mesg.src_project_id
                        }`
                      );
                    } else {
                      cb();
                    }
                  }
                });
              },
              (cb): void => {
                access.user_has_write_access_to_project({
                  database: this.client.database,
                  project_id: mesg.target_project_id,
                  account_id: this.client.account_id,
                  account_groups: this.client.groups,
                  cb: (err, result) => {
                    if (err) {
                      cb(err);
                    } else if (!result) {
                      cb(
                        `user must have write access to target project ${
                          mesg.target_project_id
                        }`
                      );
                    } else {
                      return cb();
                    }
                  }
                });
              }
            ],
            cb
          );
        },

        (cb): void => {
          // do the copy
          this.client.compute_server.project({
            project_id: mesg.src_project_id,
            cb: (err, project) => {
              if (err) {
                cb(err);
                return;
              }

              project.copy_path({
                path: mesg.src_path,
                target_project_id: mesg.target_project_id,
                target_path: mesg.target_path,
                overwrite_newer: mesg.overwrite_newer,
                delete_missing: mesg.delete_missing,
                backup: mesg.backup,
                timeout: mesg.timeout,
                exclude_history: mesg.exclude_history,
                wait_until_done: mesg.wait_until_done,
                scheduled: mesg.scheduled,
                cb: (err, copy_id) => {
                  if (err) {
                    cb(err);
                  } else {
                    locals.copy_id = copy_id;
                    cb();
                  }
                }
              });
            }
          });
        }
      ],
      (err): void => {
        if (err) {
          this.client.error_to_client({ id: mesg.id, error: err });
        } else {
          // we only expect a copy_id in kucalc mode
          if (locals.copy_id != null) {
            const resp = message.copy_path_between_projects_response({
              id: mesg.id,
              copy_path_id: locals.copy_id
            });
            this.client.push_to_client(resp);
          } else {
            this.client.push_to_client(message.success({ id: mesg.id }));
          }
        }
      }
    );
  }

  status(mesg) {
    this.client.touch();
    //const dbg = this.dbg("status");
    // src_project_id, target_project_id and optionally src_path + offset (limit is 1000)
    const search_many =
      mesg.src_project_id != null || mesg.target_project_id != null;
    if (!search_many && mesg.copy_path_id == null) {
      this.client.error_to_client({
        id: mesg.id,
        error:
          "'copy_path_id' (UUID) of a copy operation or 'src_project_id/target_project_id' must be defined"
      });
      return;
    }
    if (search_many) {
      this._status_query(mesg);
    } else {
      this._status_single(mesg);
    }
  }

  private _status_query(mesg) {
    const locals = {
      allowed: true, // this is not really necessary
      copy_ops: [] as CopyOp[]
    };

    const dbg = this.dbg("status_query");

    async.series(
      [
        (cb): void => {
          if (mesg.src_project_id == null) {
            cb();
            return;
          }
          access.user_has_read_access_to_project({
            project_id: mesg.src_project_id,
            account_id: this.client.account_id,
            account_groups: this.client.groups,
            database: this.client.database,
            cb: (err, result) => {
              if (err) {
                cb(err);
              } else if (!result) {
                locals.allowed = false;
                cb("ACCESS BLOCKED -- No read access to source project");
              } else {
                cb();
              }
            }
          });
        },
        (cb): void => {
          if (mesg.target_project_id == null) {
            cb();
            return;
          }
          access.user_has_write_access_to_project({
            database: this.client.database,
            project_id: mesg.target_project_id,
            account_id: this.client.account_id,
            account_groups: this.client.groups,
            cb: (err, result) => {
              if (err) {
                cb(err);
              } else if (!result) {
                locals.allowed = false;
                cb("ACCESS BLOCKED -- No write access to target project");
              } else {
                cb();
              }
            }
          });
        },
        async (cb): Promise<void> => {
          if (!locals.allowed) {
            cb("Not allowed");
            return;
          }

          const where: WhereQueries = [
            {
              "source_project_id = $::UUID": mesg.src_project_id,
              "target_project_id = $::UUID": mesg.target_project_id
            }
          ];

          if (mesg.src_path != null) {
            where.push({ "source_path = $": mesg.src_path });
          }

          // all failed ones are implicitly also finished
          if (mesg.failed === true || mesg.failed === "true") {
            where.push("error IS NOT NULL");
            mesg.pending = false;
          }

          if (mesg.pending === true) {
            where.push("finished IS NULL");
          }

          // sanitizing input!
          let limit, offset;
          try {
            offset = sanitize(mesg.offset, 0, 100, "offset");
            limit = sanitize(mesg.limit, 1000, 1000, "limit");
          } catch (error) {
            const err = error;
            dbg(err.message);
            cb(err.message);
            return;
          }

          dbg(`offset=${offset}   limit=${limit}`);

          try {
            const status_data = await callback2(this.client.database._query, {
              query: "SELECT * FROM copy_paths",
              where,
              offset,
              limit,
              order_by: "time DESC"
            });

            if (status_data == null) {
              cb(
                "Can't find copy operations for given src_project_id/target_project_id"
              );
            } else {
              for (let row of Array.from(status_data.rows)) {
                // be explicit about what we return
                locals.copy_ops.push(row_to_copy_op(row));
              }
              cb();
            }
          } catch (err) {
            cb(err);
          }
        }
      ],
      (err): void => {
        if (err) {
          this.client.error_to_client({ id: mesg.id, error: err });
        } else {
          this.client.push_to_client(
            message.copy_path_status_response({
              id: mesg.id,
              data: locals.copy_ops
            })
          );
        }
      }
    );
  }

  private _get_status(mesg, cb) {
    if (mesg.copy_path_id == null) {
      cb("ERROR: copy_path_id missing");
      return;
    }

    const dbg = this.dbg("_get_status");
    const locals: { copy_op: CopyOp | undefined } = { copy_op: undefined };
    async.series(
      [
        // get the info
        async (cb): Promise<void> => {
          const where: WhereQueries = [{ "id = $::UUID": mesg.copy_path_id }];
          if (mesg.not_yet_done) {
            where.push("scheduled IS NOT NULL");
            where.push("finished IS NULL");
          }

          try {
            const statuses = await callback2(this.client.database._query, {
              query: "SELECT * FROM copy_paths",
              where
            });

            one_result((_, x) => {
              if (x == null) {
                if (mesg.not_yet_done) {
                  cb(
                    `Copy operation '${
                      mesg.copy_path_id
                    }' either does not exist or already finished`
                  );
                } else {
                  cb(`Can't find copy operation with ID=${mesg.copy_path_id}`);
                }
              } else {
                locals.copy_op = x;
                dbg(`copy_op=${misc.to_json(locals.copy_op)}`);
                cb();
              }
            })(undefined, statuses);
          } catch (err) {
            cb(err);
          }
        },

        (cb): void => {
          if (locals.copy_op == null) {
            cb(`Can't find copy operation with ID=${mesg.copy_path_id}`);
            return;
          }

          // now we prevent someone who was kicked out of a project to check the copy status
          const { target_project_id } = locals.copy_op;
          const { source_project_id } = locals.copy_op;
          async.parallel(
            [
              (cb): void => {
                access.user_has_read_access_to_project({
                  project_id: source_project_id,
                  account_id: this.client.account_id,
                  account_groups: this.client.groups,
                  database: this.client.database,
                  cb: (err, result) => {
                    if (err) {
                      cb(err);
                    } else if (!result) {
                      cb(
                        "ACCESS BLOCKED -- No read access to source project of this copy operation"
                      );
                    } else {
                      cb();
                    }
                  }
                });
              },
              (cb): void => {
                access.user_has_write_access_to_project({
                  database: this.client.database,
                  project_id: target_project_id,
                  account_id: this.client.account_id,
                  account_groups: this.client.groups,
                  cb: (err, result) => {
                    if (err) {
                      cb(err);
                    } else if (!result) {
                      cb(
                        "ACCESS BLOCKED -- No write access to target project of this copy operation"
                      );
                    } else {
                      cb();
                    }
                  }
                });
              }
            ],
            cb
          );
        }
      ],
      (err): void => {
        cb(err, locals.copy_op);
      }
    );
  }

  private _status_single(mesg) {
    this._get_status(mesg, (err, copy_op) => {
      if (err) {
        this.client.error_to_client({ id: mesg.id, error: err });
      } else {
        // be explicit about what we return
        const data = row_to_copy_op(copy_op);
        this.client.push_to_client(
          message.copy_path_status_response({ id: mesg.id, data })
        );
      }
    });
  }

  delete(mesg): void {
    this.client.touch();
    const dbg = this.dbg("delete");
    // this filters possible results
    mesg.not_yet_done = true;
    this._get_status(mesg, async (err, copy_op) => {
      if (err) {
        dbg(`stauts err=${err}`);
        this.client.error_to_client({ id: mesg.id, error: err });
      } else if (copy_op == null) {
        this.client.error_to_client({
          id: mesg.id,
          error: "copy op '${mesg.copy_path_id}' cannot be deleted."
        });
      } else {
        try {
          await callback2(this.client.database._query, {
            query: "DELETE FROM copy_paths",
            where: { "id = $::UUID": mesg.copy_path_id }
          });
          // no error
          this.client.push_to_client(
            message.copy_path_status_response({
              id: mesg.id,
              data: `copy_path_id = '${mesg.copy_path_id}' deleted`
            })
          );
        } catch (err) {
          dbg(`query err=${err}`);
          this.client.error_to_client({ id: mesg.id, error: err });
        }
      }
    });
  }
}
