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

import { callback } from "awaiting";

import { PostgreSQL, QuerySelect } from "./types";

import { query, query_one } from "./changefeed-query";

type WhereCondition = Function | object | object[];

type ChangeAction = "delete" | "insert" | "update";
function parse_action(obj: string): ChangeAction {
  const s: string = `${obj.toLowerCase()}`;
  if (s === "delete" || s === "insert" || s === "update") {
    return s;
  }
  throw Error(`invalid action "${s}"`);
}

interface ChangeEvent {
  action: ChangeAction;
  new_val?: object;
  old_val?: object;
}

export class Changes extends EventEmitter {
  private db: PostgreSQL;
  private table: string;
  private select: QuerySelect;
  private watch: string[];
  private where: WhereCondition;

  private trigger_name: string;
  private closed: boolean;
  private condition: { [field: string]: Function };
  private match_condition: Function;

  constructor(
    db: PostgreSQL,
    table: string,
    select: QuerySelect,
    watch: string[],
    where: WhereCondition,
    cb: Function
  ) {
    super();
    this.handle_change = this.handle_change.bind(this);

    this.db = db;
    this.table = table;
    this.select = select;
    this.watch = watch;
    this.where = where;
    this.init(cb);
  }

  async init(cb: Function): Promise<void> {
    this.dbg("constructor")(
      `select=${misc.to_json(this.select)}, watch=${misc.to_json(
        this.watch
      )}, @_where=${misc.to_json(this.where)}`
    );

    try {
      this.init_where();
    } catch (e) {
      cb(`error initializing where conditions -- ${e}`);
      return;
    }

    try {
      this.trigger_name = await callback(
        this.db._listen,
        this.table,
        this.select,
        this.watch
      );
    } catch (err) {
      cb(err);
      return;
    }
    this.db.on(this.trigger_name, this.handle_change);
    // NOTE: we close on *connect*, not on disconnect, since then clients
    // that try to reconnect will only try to do so when we have an actual
    // connection to the database.  No point in worrying them while trying
    // to reconnect, which only makes matters worse (as they panic and
    // requests pile up!).
    this.db.once("connect", this.close);
    cb(undefined, this);
  }

  private dbg(f: string): Function {
    return this.db._dbg(`Changes(table='${this.table}').${f}`);
  }

  // this breaks the changefeed -- client must recreate it; nothing further will work at all.
  private fail(err): void {
    if (this.closed) {
      return;
    }
    this.dbg("_fail")(`err='${err}'`);
    this.emit("error", new Error(err));
    this.close();
  }

  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.emit("close", { action: "close" });
    this.removeAllListeners();
    this.db.removeListener(this.trigger_name, this.handle_change);
    this.db.removeListener("connect", this.close);
    this.db._stop_listening(this.table, this.select, this.watch);
    delete this.trigger_name;
    delete this.condition;
  }

  public async insert(where): Promise<void> {
    const where0: { [field: string]: any } = {};
    for (let k in where) {
      const v = where[k];
      where0[`${k} = $`] = v;
    }
    let results: { [field: string]: any }[];
    try {
      results = await query({
        db: this.db,
        select: this.watch.concat(misc.keys(this.select)),
        table: this.table,
        where: where0
      });
    } catch (err) {
      this.fail(err); // this is game over
      return;
    }
    for (let x of results) {
      if (this.match_condition(x)) {
        misc.map_mutate_out_undefined(x);
        const change: ChangeEvent = { action: "insert", new_val: x };
        this.emit("change", change);
      }
    }
  }

  public delete(where): void {
    // listener is meant to delete everything that *matches* the where, so
    // there is no need to actually do a query.
    const change: ChangeEvent = { action: "delete", old_val: where };
    this.emit("change", change);
  }

  private old_val(result, action, mesg): void {
    if (action === "update") {
      // include only changed fields if action is 'update'
      const old_val = {};
      for (let field in mesg[1]) {
        const val = mesg[1][field];
        const old = mesg[2][field];
        if (val !== old) {
          old_val[field] = old;
        }
      }
      if (misc.len(old_val) > 0) {
        result.old_val = old_val;
      }
    }
  }

  private async handle_change(mesg): Promise<void> {
    //console.log '_handle_change', mesg
    if (mesg[0] === "DELETE") {
      if (!this.match_condition(mesg[2])) {
        return;
      }
      this.emit("change", { action: "delete", old_val: mesg[2] });
      return;
    }
    let k: string, r: ChangeEvent, v: any;
    if (typeof mesg[0] !== "string") {
      throw Error(`invalid mesg -- mesg[0] must be a string`);
    }
    const action: ChangeAction = parse_action(mesg[0]);
    if (!this.match_condition(mesg[1])) {
      if (action !== "update") {
        return;
      }
      for (k in mesg[1]) {
        v = mesg[1][k];
        if (mesg[2][k] == null) {
          mesg[2][k] = v;
        }
        if (this.match_condition(mesg[2])) {
          this.emit("change", { action: "delete", old_val: mesg[2] });
        }
        return; // TODO: This looks *very* suspicious -- it just seems
        // more likely that this would be in the if statement.
        // Once I figure out what the heck is going on here,
        // fix or write a clear comment!
      }
    }
    if (this.watch.length === 0) {
      r = { action, new_val: mesg[1] };
      this.old_val(r, action, mesg);
      this.emit("change", r);
      return;
    }
    const where = {};
    for (k in mesg[1]) {
      v = mesg[1][k];
      where[`${k} = $`] = v;
    }
    let result: undefined | { [field: string]: any };
    try {
      result = await query_one({
        db: this.db,
        select: this.watch,
        table: this.table,
        where
      });
    } catch (err) {
      this.fail(err);
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
    this.old_val(r, action, mesg);
    this.emit("change", r);
  }

  private init_where(): void {
    if (typeof this.where === "function") {
      // user provided function
      this.match_condition = this.where;
      return;
    }

    let w: any[];
    if (misc.is_object(this.where)) {
      w = [this.where];
    } else {
      // TODO: misc.is_object needs to be a typescript checker instead, so
      // this as isn't needed.
      w = this.where as object[];
    }

    this.condition = {};
    const add_condition = (field: string, op: string, val: any): void => {
      let f: Function, g: Function;
      field = field.trim();
      if (field[0] === '"') {
        // de-quote
        field = field.slice(1, field.length - 1);
      }
      if (this.select[field] == null) {
        throw Error(`'${field}' must be in select`);
      }
      if (misc.is_object(val)) {
        throw Error(`val (=${misc.to_json(val)}) must not be an object`);
      }
      if (misc.is_array(val)) {
        if (op === "=" || op === "==") {
          // containment
          f = function(x) {
            for (let v of val) {
              if (x === v) {
                return true;
              }
            }
            return false;
          };
        } else if (op === "!=" || op === "<>") {
          // not contained in
          f = function(x) {
            for (let v of val) {
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
      this.condition[field] = f;
    };

    for (let obj of w) {
      let found: boolean, i: number, op: string;
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
          for (op of misc.operators) {
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
        for (op of misc.operators) {
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
    if (misc.len(this.condition) === 0) {
      delete this.condition;
    }

    this.match_condition = (obj: object): boolean => {
      //console.log '_match_condition', obj
      if (this.condition == null) {
        return true;
      }
      for (let field in this.condition) {
        const f = this.condition[field];
        if (!f(obj[field])) {
          //console.log 'failed due to field ', field
          return false;
        }
      }
      return true;
    };
  }
}
