/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
import * as misc from "@cocalc/util/misc";
import { opToFunction, OPERATORS, Operator } from "@cocalc/util/db-schema";
import { callback } from "awaiting";
import { PostgreSQL, QuerySelect } from "../types";
import { query } from "./changefeed-query";

type WhereCondition = Function | object | object[];

type ChangeAction = "delete" | "insert" | "update";
function parse_action(obj: string): ChangeAction {
  const s: string = `${obj.toLowerCase()}`;
  if (s === "delete" || s === "insert" || s === "update") {
    return s;
  }
  throw Error(`invalid action "${s}"`);
}

export interface ChangeEvent {
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
  private condition?: { [field: string]: Function };
  private match_condition: Function;

  private val_update_cache: { [key: string]: any } = {};

  constructor(
    db: PostgreSQL,
    table: string,
    select: QuerySelect,
    watch: string[],
    where: WhereCondition,
    cb: Function,
  ) {
    super();
    this.db = db;
    this.table = table;
    this.select = select;
    this.watch = watch;
    this.where = where;
    this.init(cb);
  }

  init = async (cb: Function): Promise<void> => {
    this.dbg("constructor")(
      `select=${misc.to_json(this.select)}, watch=${misc.to_json(
        this.watch,
      )}, @_where=${misc.to_json(this.where)}`,
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
        this.watch,
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

    // This setMaxListeners is here because I keep getting warning about
    // this despite setting it in the db constructor.  Putting this here
    // definitely does work, whereas having it only in the constructor
    // definitely does NOT.  Don't break this without thought, as it has very bad
    // consequences when the database connection drops.
    this.db.setMaxListeners(0);

    this.db.once("connect", this.close);
    cb(undefined, this);
  };

  private dbg = (f: string): Function => {
    return this.db._dbg(`Changes(table='${this.table}').${f}`);
  };

  // this breaks the changefeed -- client must recreate it; nothing further will work at all.
  private fail = (err): void => {
    if (this.closed) {
      return;
    }
    this.dbg("_fail")(`err='${err}'`);
    this.emit("error", new Error(err));
    this.close();
  };

  close = (): void => {
    if (this.closed) {
      return;
    }
    this.emit("close", { action: "close" });
    this.removeAllListeners();
    if (this.db != null) {
      this.db.removeListener(this.trigger_name, this.handle_change);
      this.db.removeListener("connect", this.close);
      this.db._stop_listening(this.table, this.select, this.watch);
    }
    misc.close(this);
    this.closed = true;
  };

  insert = async (where): Promise<void> => {
    const where0: { [field: string]: any } = {};
    for (const k in where) {
      const v = where[k];
      where0[`${k} = $`] = v;
    }
    let results: { [field: string]: any }[];
    try {
      results = await query({
        db: this.db,
        select: this.watch.concat(misc.keys(this.select)),
        table: this.table,
        where: where0,
        one: false,
      });
    } catch (err) {
      this.fail(err); // this is game over
      return;
    }
    for (const x of results) {
      if (this.match_condition(x)) {
        misc.map_mutate_out_undefined_and_null(x);
        const change: ChangeEvent = { action: "insert", new_val: x };
        this.emit("change", change);
      }
    }
  };

  delete = (where): void => {
    // listener is meant to delete everything that *matches* the where, so
    // there is no need to actually do a query.
    const change: ChangeEvent = { action: "delete", old_val: where };
    this.emit("change", change);
  };

  private handle_change = async (mesg): Promise<void> => {
    if (this.closed) {
      return;
    }
    // this.dbg("handle_change")(JSON.stringify(mesg));
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
    let action: ChangeAction = parse_action(mesg[0]);
    if (!this.match_condition(mesg[1])) {
      // object does not match condition
      if (action !== "update") {
        // new object that doesn't match condition -- nothing to do.
        return;
      }
      // fill in for each part that we watch in new object the same
      // data in the old object, in case it is missing.
      // TODO: when is this actually needed?
      for (k in mesg[1]) {
        v = mesg[1][k];
        if (mesg[2][k] == null) {
          mesg[2][k] = v;
        }
      }
      if (this.match_condition(mesg[2])) {
        // the old object was in our changefeed, but the UPDATE made it not
        // anymore, so we emit delete action.
        this.emit("change", { action: "delete", old_val: mesg[2] });
      }
      // Nothing more to do.
      return;
    }
    if (this.watch.length === 0) {
      // No additional columns are being watched at all -- we only
      // care about what's in the mesg.
      r = { action, new_val: mesg[1] };
      this.emit("change", r);
      return;
    }
    // Additional columns are watched so we must do a query to get them.
    // There's no way around this due to the size limits on postgres LISTEN/NOTIFY.
    const where = {};
    for (k in mesg[1]) {
      v = mesg[1][k];
      where[`${k} = $`] = v;
    }
    let result: undefined | { [field: string]: any };
    try {
      result = await query({
        db: this.db,
        select: this.watch,
        table: this.table,
        where,
        one: true,
      });
    } catch (err) {
      this.fail(err);
      return;
    }

    // we do know from stacktraces that new_val_update is called after closed
    // this must have happened during waiting on the query. aborting early.
    if (this.closed) {
      return;
    }

    if (result == null) {
      // This happens when record isn't deleted, but some
      // update results in the object being removed from our
      // selection criterion... which we view as "delete".
      this.emit("change", { action: "delete", old_val: mesg[1] });
      return;
    }

    const key = JSON.stringify(mesg[1]);
    const this_val = misc.merge(result, mesg[1]);
    let new_val;
    if (action == "update") {
      const x = this.new_val_update(mesg[1], this_val, key);
      if (x == null) {
        // happens if this.closed is true -- double check for safety (and typescript).
        return;
      }
      action = x.action; // may be insert in case no previous cached info.
      new_val = x.new_val;
    } else {
      // not update and not delete (could have been a delete and write
      // before we did above query, so treat as insert).
      action = "insert";
      new_val = this_val;
    }
    this.val_update_cache[key] = this_val;

    r = { action, new_val };
    this.emit("change", r);
  };

  private new_val_update = (
    primary_part: { [key: string]: any },
    this_val: { [key: string]: any },
    key: string,
  ):
    | { new_val: { [key: string]: any }; action: "insert" | "update" }
    | undefined => {
    if (this.closed) {
      return;
    }
    const prev_val = this.val_update_cache[key];
    if (prev_val == null) {
      return { new_val: this_val, action: "insert" }; // not enough info to make a diff
    }
    this.dbg("new_val_update")(`${JSON.stringify({ this_val, prev_val })}`);

    // Send only the fields that changed between
    // prev_val and this_val, along with the primary part.
    const new_val = misc.copy(primary_part);
    // Not using lodash isEqual below, since we want equal Date objects
    // to compare as equal.  If JSON is randomly re-ordered, that's fine since
    // it is just slightly less efficienct.
    for (const field in this_val) {
      if (
        new_val[field] === undefined &&
        JSON.stringify(this_val[field]) != JSON.stringify(prev_val[field])
      ) {
        new_val[field] = this_val[field];
      }
    }
    for (const field in prev_val) {
      if (prev_val[field] != null && this_val[field] == null) {
        // field was deleted / set to null -- we must inform in the update
        new_val[field] = null;
      }
    }
    return { new_val, action: "update" };
  };

  private init_where = (): void => {
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
    const add_condition = (field: string, op: Operator, val: any): void => {
      if (this.condition == null) {
        return; // won't happen
      }
      let f: Function, g: Function;
      field = field.trim();
      if (field[0] === '"') {
        // de-quote
        field = field.slice(1, field.length - 1);
      }
      if (this.select[field] == null) {
        throw Error(
          `'${field}' must be in select="${JSON.stringify(this.select)}"`,
        );
      }
      if (misc.is_object(val)) {
        throw Error(`val (=${misc.to_json(val)}) must not be an object`);
      }
      if (misc.is_array(val)) {
        if (op === "=" || op === "==") {
          // containment
          f = function (x) {
            for (const v of val) {
              if (x === v) {
                return true;
              }
            }
            return false;
          };
        } else if (op === "!=" || op === "<>") {
          // not contained in
          f = function (x) {
            for (const v of val) {
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
        if (op == "=" || op == "==") {
          f = (x) => new Date(x).valueOf() - val.valueOf() === 0;
        } else if (op == "!=" || op == "<>") {
          f = (x) => new Date(x).valueOf() - val.valueOf() !== 0;
        } else {
          g = opToFunction(op);
          f = (x) => g(new Date(x), val);
        }
      } else {
        g = opToFunction(op);
        f = (x) => g(x, val);
      }
      this.condition[field] = f;
    };

    for (const obj of w) {
      if (misc.is_object(obj)) {
        for (const k in obj) {
          const val = obj[k];
          /*
          k should be of one of the following forms
             - "field op $::TYPE"
             - "field op $" or
             - "field op any($)"
             - "$ op any(field)"
             - 'field' (defaults to =)
          where op is one of =, <, >, <=, >=, !=

          val must be:
             - something where javascript === and comparisons works as you expect!
             - or an array, in which case op must be = or !=, and we ALWAYS do inclusion (analogue of any).
          */
          if (k.startsWith("$")) {
            /*
            The "$ op any(field)" is used, e.g., for having multiple owners
            of a single thing, e.g.,:

               pg_where: [{ "$::UUID = ANY(owner_account_ids)": "account_id" }]

            where we need to get the field(=owner_account_ids) and check that
            val(=account_id) is in it, at the javascript level.
            */
            if (k.includes("<") || k.includes(">")) {
              throw Error("only = and != are supported");
            }
            const isEquals = !k.includes("!=");
            const i = k.toLowerCase().indexOf("any(");
            if (i == -1) {
              throw Error(
                "condition must be $=ANY(...) or $!=ANY(...) -- missing close paren",
              );
            }
            const j = k.lastIndexOf(")");
            if (j == -1) {
              throw Error(
                "condition must be $=ANY(...) or $!=ANY(...) -- missing close parent",
              );
            }
            const field = k.slice(i + 4, j);
            if (isEquals) {
              this.condition[field] = (x) => !!x?.includes(val);
            } else {
              this.condition[field] = (x) => !x?.includes(val);
            }
          } else {
            let found = false;
            for (const op of OPERATORS) {
              const i = k.indexOf(op);
              if (i !== -1) {
                const field = k.slice(0, i).trim();
                add_condition(field, op, val);
                found = true;
                break;
              }
            }
            if (!found) {
              throw Error(`unable to parse '${k}'`);
            }
          }
        }
      } else if (typeof obj === "string") {
        let found = false;
        for (const op of OPERATORS) {
          const i = obj.indexOf(op);
          if (i !== -1) {
            add_condition(
              obj.slice(0, i),
              op,
              eval(obj.slice(i + op.length).trim()),
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
      for (const field in this.condition) {
        const f = this.condition[field];
        if (!f(obj[field])) {
          //console.log 'failed due to field ', field
          return false;
        }
      }
      return true;
    };
  };
}
