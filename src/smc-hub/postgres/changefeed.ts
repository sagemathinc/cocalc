/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 */
/*
The Changes class is a useful building block
for making changefeeds.  It lets you watch when given
columns change in a given table, and be notified
when a where condition is satisfied.

IMPORTANT: If an error event is emitted then
Changes object will close and not work any further!
You must recreate it.
*/

import { EventEmitter } from "events";

import * as misc from "smc-util/misc";

const { one_result, all_results } = require("../postgres-base");

export class Changes extends EventEmitter {
  private _db: any;
  private _table: any;
  private _select: any;
  private _watch: any;
  private _where: any;
  private dbg: Function;

  private _tgname: string;
  private _closed: boolean;
  private _condition: any;
  private _match_condition: Function;

  constructor(_db, _table, _select, _watch, _where, cb) {
    super();

    this._dbg = this._dbg.bind(this);
    this._fail = this._fail.bind(this);
    this.close = this.close.bind(this);
    this._old_val = this._old_val.bind(this);
    this._handle_change = this._handle_change.bind(this);
    this.insert = this.insert.bind(this);
    this.delete = this.delete.bind(this);
    this._init_where = this._init_where.bind(this);

    this._db = _db;
    this._table = _table;
    this._select = _select;
    this._watch = _watch;
    this._where = _where;
    this.dbg = this._dbg("constructor");
    this.dbg(
      `select=${misc.to_json(this._select)}, watch=${misc.to_json(
        this._watch
      )}, @_where=${misc.to_json(this._where)}`
    );
    try {
      this._init_where();
    } catch (e) {
      if (typeof cb === "function") {
        cb(`error initializing where conditions -- ${e}`);
      }
      return;
    }
    this._db._listen(this._table, this._select, this._watch, (err, tgname) => {
      if (err) {
        if (typeof cb === "function") {
          cb(err);
        }
        return;
      }
      this._tgname = tgname;
      this._db.on(this._tgname, this._handle_change);
      // NOTE: we close on *connect*, not on disconnect, since then clients
      // that try to reconnect will only try to do so when we have an actual
      // connection to the database.  No point in worrying them while trying
      // to reconnect, which only makes matters worse (as they panic and
      // requests pile up!).
      this._db.once("connect", this.close);
      return typeof cb === "function" ? cb(undefined, this) : undefined;
    });
  }

  _dbg(f: string): Function {
    return this._db._dbg(`Changes(table='${this._table}').${f}`);
  }

  // this breaks the changefeed -- client must recreate it; nothing further will work at all.
  _fail(err) {
    if (this._closed) {
      return;
    }
    const dbg = this._dbg("_fail");
    dbg(`err='${err}'`);
    this.emit("error", new Error(err));
    this.close();
  }

  close(cb?: Function) {
    if (this._closed) {
      if (typeof cb === "function") {
        cb();
      }
      return;
    }
    this._closed = true;
    this.emit("close", { action: "close" });
    this.removeAllListeners();
    this._db.removeListener(this._tgname, this._handle_change);
    this._db.removeListener("connect", this.close);
    this._db._stop_listening(this._table, this._select, this._watch, cb);
    delete this._tgname;
    delete this._condition;
    return typeof cb === "function" ? cb() : undefined;
  }

  _old_val(result, action, mesg) {
    // include only changed fields if action is 'update'
    if (action === "update") {
      const old_val = {};
      for (let field in mesg[1]) {
        const val = mesg[1][field];
        const old = mesg[2][field];
        if (val !== old) {
          old_val[field] = old;
        }
      }
      if (misc.len(old_val) > 0) {
        return (result.old_val = old_val);
      }
    }
  }

  _handle_change(mesg) {
    //console.log '_handle_change', mesg
    if (mesg[0] === "DELETE") {
      if (!this._match_condition(mesg[2])) {
        return;
      }
      return this.emit("change", { action: "delete", old_val: mesg[2] });
    } else {
      let k, r, v;
      const action = `${mesg[0].toLowerCase()}`;
      if (!this._match_condition(mesg[1])) {
        if (action !== "update") {
          return;
        }
        for (k in mesg[1]) {
          v = mesg[1][k];
          if (mesg[2][k] == null) {
            mesg[2][k] = v;
          }
          if (this._match_condition(mesg[2])) {
            this.emit("change", { action: "delete", old_val: mesg[2] });
          }
          return;
        }
      }
      if (this._watch.length === 0) {
        r = { action, new_val: mesg[1] };
        this._old_val(r, action, mesg);
        this.emit("change", r);
        return;
      }
      const where = {};
      for (k in mesg[1]) {
        v = mesg[1][k];
        where[`${k} = $`] = v;
      }
      return this._db._query({
        select: this._watch,
        table: this._table,
        where,
        cb: one_result((err, result) => {
          if (err) {
            this._fail(err);
            return;
          }
          if (result == null) {
            // This happens when record isn't deleted, but some
            // update results in the object being removed from our
            // selection criterion... which we view as "delete".
            this.emit("change", { action: "delete", old_val: mesg[1] });
            return;
          }
          r = { action, new_val: misc.merge(result, mesg[1]) };
          this._old_val(r, action, mesg);
          return this.emit("change", r);
        })
      });
    }
  }

  insert(where) {
    const where0 = {};
    for (let k in where) {
      const v = where[k];
      where0[`${k} = $`] = v;
    }
    return this._db._query({
      select: this._watch.concat(misc.keys(this._select)),
      table: this._table,
      where: where0,
      cb: all_results((err, results) => {
        //# Useful for testing that the @_fail thing below actually works.
        //#if Math.random() < .7
        //#    err = "simulated error"
        if (err) {
          this._dbg("insert")("FAKE ERROR!");
          this._fail(err); // this is game over
          return;
        } else {
          for (let x of results) {
            if (this._match_condition(x)) {
              misc.map_mutate_out_undefined(x);
              this.emit("change", { action: "insert", new_val: x });
            }
          }
        }
      })
    });
  }

  delete(where) : void {
    // listener is meant to delete everything that *matches* the where, so
    // there is no need to actually do a query.
    this.emit("change", { action: "delete", old_val: where });
  }

  _init_where() {
    let w;
    if (typeof this._where === "function") {
      // user provided function
      this._match_condition = this._where;
      return;
    }
    if (misc.is_object(this._where)) {
      w = [this._where];
    } else {
      w = this._where;
    }

    this._condition = {};
    const add_condition = (field, op, val) => {
      let f, g;
      field = field.trim();
      if (field[0] === '"') {
        // de-quote
        field = field.slice(1, field.length - 1);
      }
      if (this._select[field] == null) {
        throw Error(`'${field}' must be in select`);
      }
      if (misc.is_object(val)) {
        throw Error(`val (=${misc.to_json(val)}) must not be an object`);
      }
      if (misc.is_array(val)) {
        if (op === "=" || op === "==") {
          // containment
          f = function(x) {
            for (let v of Array.from(val)) {
              if (x === v) {
                return true;
              }
            }
            return false;
          };
        } else if (op === "!=" || op === "<>") {
          // not contained in
          f = function(x) {
            for (let v of Array.from(val)) {
              if (x === v) {
                return false;
              }
            }
            return true;
          };
        } else {
          throw Error("if val is an array, then op must be = or !=");
        }
      } else if (misc.is_date(val)) {
        // Inputs to condition come back as JSON, which doesn't know
        // about timestamps, so we convert them to date objects.
        if (["=", "=="].includes(op)) {
          f = x => new Date(x).valueOf() - val === 0;
        } else if (["!=", "<>"].includes(op)) {
          f = x => new Date(x).valueOf() - val !== 0;
        } else {
          g = misc.op_to_function(op);
          f = x => g(new Date(x), val);
        }
      } else {
        g = misc.op_to_function(op);
        f = x => g(x, val);
      }
      return (this._condition[field] = f);
    };

    for (let obj of Array.from(w)) {
      var found, i, op;
      if (misc.is_object(obj)) {
        for (let k in obj) {
          const val = obj[k];
          /*
                    k should be of one of the following forms
                       - "field op $::TYPE"
                       - "field op $" or
                       - "field op any($)"
                       - 'field' (defaults to =)
                    where op is one of =, <, >, <=, >=, !=

                    val must be:
                       - something where javascript === and comparisons works as you expect!
                       - or an array, in which case op must be = or !=, and we ALWAYS do inclusion (analogue of any).
                    */
          found = false;
          for (op of Array.from(misc.operators)) {
            i = k.indexOf(op);
            if (i !== -1) {
              add_condition(k.slice(0, i).trim(), op, val);
              found = true;
              break;
            }
          }
          if (!found) {
            throw Error(`unable to parse '${k}'`);
          }
        }
      } else if (typeof obj === "string") {
        found = false;
        for (op of Array.from(misc.operators)) {
          i = obj.indexOf(op);
          if (i !== -1) {
            add_condition(
              obj.slice(0, i),
              op,
              eval(obj.slice(i + op.length).trim())
            );
            found = true;
            break;
          }
        }
        if (!found) {
          throw Error(`unable to parse '${obj}'`);
        }
      } else {
        throw Error("NotImplementedError");
      }
    }
    if (misc.len(this._condition) === 0) {
      delete this._condition;
    }

    return (this._match_condition = obj => {
      //console.log '_match_condition', obj
      if (this._condition == null) {
        return true;
      }
      for (let field in this._condition) {
        const f = this._condition[field];
        if (!f(obj[field])) {
          //console.log 'failed due to field ', field
          return false;
        }
      }
      return true;
    });
  }
}
