/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Query Engine - __do_query

TypeScript implementation of the internal query execution logic.
*/

import validator from "validator";

import * as misc from "@cocalc/util/misc";

import { do_query_with_pg_params } from "../set-pg-params";
import type { PostgreSQL, QueryOptions } from "../types";
import { quote_field } from "../utils/quote-field";

const QUERY_ALERT_THRESH_MS = 5000;

export function doQuery(db: PostgreSQL, opts: QueryOptions): void {
  const dbAny = db as any;
  const dbg = db._dbg(
    `__do_query('${misc.trunc(
      opts.query != null ? opts.query.replace(/\n/g, " ") : undefined,
      250,
    )}',id='${misc.uuid().slice(0, 6)}')`,
  );
  if (!db.is_connected()) {
    // TODO: should also check that client is connected.
    if (typeof opts.cb === "function") {
      opts.cb("client not yet initialized");
    }
    return;
  }
  if (opts.params != null && !misc.is_array(opts.params)) {
    if (typeof opts.cb === "function") {
      opts.cb("params must be an array");
    }
    return;
  }
  const params = opts.params ?? [];
  opts.params = params;
  opts.safety_check ??= true;
  if (opts.query == null) {
    if (opts.table == null) {
      if (typeof opts.cb === "function") {
        opts.cb("if query not given, then table must be given");
      }
      return;
    }
    if (
      opts.values != null ||
      opts.set != null ||
      opts.jsonb_set != null ||
      opts.jsonb_merge != null
    ) {
      if (typeof opts.cb === "function") {
        opts.cb("query must be specified when values or set are defined");
      }
      return;
    }
    if (opts.select == null) {
      opts.select = "*";
    }
    if (misc.is_array(opts.select)) {
      opts.select = (() => {
        const result: any[] = [];
        for (const selectedField of Array.from<string>(opts.select)) {
          result.push(quote_field(selectedField));
        }
        return result;
      })().join(",");
    }
    opts.query = `SELECT ${opts.select} FROM \"${opts.table}\"`;
    delete opts.select;
  }

  let queryText = opts.query ?? "";

  const push_param = function (param, type?) {
    if ((type != null ? type.toUpperCase() : undefined) === "JSONB") {
      param = misc.to_json(param); // I don't understand why this is needed by the driver....
    }
    params.push(param);
    return params.length;
  };

  if (opts.jsonb_merge != null) {
    if (opts.jsonb_set != null) {
      if (typeof opts.cb === "function") {
        opts.cb("if jsonb_merge is set then jsonb_set must not be set");
      }
      return;
    }
    opts.jsonb_set = opts.jsonb_merge;
  }

  const SET: any[] = [];
  if (opts.jsonb_set != null) {
    // This little piece of very hard to write (and clever?) code
    // makes it so we can set or **merge in at any nested level** (!)
    // arbitrary JSON objects.  We can also delete any key at any
    // level by making the value null or undefined!  This is amazingly
    // easy to use in queries -- basically making JSONP with postgres
    // as expressive as RethinkDB REQL (even better in some ways).
    const buildJsonbSet = (
      field: string,
      data: Record<string, any>,
      path: string[],
    ): string => {
      let obj = `COALESCE(${field}#>'{${path.join(",")}}', '{}'::JSONB)`;
      for (const key in data) {
        const val = data[key];
        if (val == null) {
          // remove key from object
          obj = `(${obj} - '${key}')`;
        } else if (
          opts.jsonb_merge != null &&
          typeof val === "object" &&
          !misc.is_date(val)
        ) {
          const subobj = buildJsonbSet(field, val, path.concat([key]));
          obj = `JSONB_SET(${obj}, '{${key}}', ${subobj})`;
        } else {
          // completely replace field[key] with val.
          obj = `JSONB_SET(${obj}, '{${key}}', $${push_param(
            val,
            "JSONB",
          )}::JSONB)`;
        }
      }
      return obj;
    };
    const jsonbAssignments = (() => {
      const result1: string[] = [];
      for (const field in opts.jsonb_set) {
        const data = opts.jsonb_set[field];
        result1.push(`${field}=${buildJsonbSet(field, data, [])}`);
      }
      return result1;
    })();
    SET.push(...jsonbAssignments);
  }

  let insertFields: string[] = [];
  let insertValues: string[][] = [];

  if (opts.values != null) {
    //dbg("values = #{misc.to_json(opts.values)}")
    if (opts.where != null) {
      if (typeof opts.cb === "function") {
        opts.cb("where must not be defined if opts.values is defined");
      }
      return;
    }

    if (misc.is_array(opts.values)) {
      // An array of numerous separate object that we will insert all at once.
      // Determine the fields, which as the union of the keys of all values.
      const fieldMap: Record<string, true> = {};
      for (const row of Array.from(opts.values)) {
        if (!misc.is_object(row)) {
          if (typeof opts.cb === "function") {
            opts.cb("if values is an array, every entry must be an object");
          }
          return;
        }
        const rowData = row as Record<string, any>;
        for (const k in rowData) {
          const fieldName = k.includes("::") ? k.split("::")[0].trim() : k;
          fieldMap[fieldName] = true;
        }
      }
      // convert to array
      const fields = misc.keys(fieldMap);
      const fieldsToIndex: Record<string, number> = {};
      let nextIndex = 0;
      for (const fieldName of Array.from(fields)) {
        fieldsToIndex[fieldName] = nextIndex;
        nextIndex += 1;
      }
      const values: string[][] = [];
      for (const row of Array.from(opts.values)) {
        const rowValues = Array(fields.length).fill("NULL");
        const rowData = row as Record<string, any>;
        for (const rawField in rowData) {
          const rawValue = rowData[rawField];
          let fieldName = rawField;
          let type: string | undefined;
          if (rawField.indexOf("::") !== -1) {
            [fieldName, type] = Array.from(rawField.split("::"));
            fieldName = fieldName.trim();
            type = type.trim();
            rowValues[fieldsToIndex[fieldName]] =
              `$${push_param(rawValue, type)}::${type}`;
          } else {
            fieldName = fieldName.trim();
            rowValues[fieldsToIndex[fieldName]] = `$${push_param(rawValue)}`;
          }
        }
        values.push(rowValues);
      }
      insertFields = fields;
      insertValues = values;
    } else {
      // A single entry that we'll insert.

      const fields: string[] = [];
      const rowValues: string[] = [];
      for (const rawField in opts.values) {
        const rawValue = opts.values[rawField];
        if (rawValue === undefined) {
          // ignore undefined fields -- makes code cleaner (and makes sense)
          continue;
        }
        if (rawField.indexOf("::") !== -1) {
          let fieldName = rawField;
          let type: string | undefined;
          [fieldName, type] = Array.from(rawField.split("::"));
          fieldName = fieldName.trim();
          type = type.trim();
          fields.push(quote_field(fieldName));
          rowValues.push(`$${push_param(rawValue, type)}::${type}`);
          continue;
        } else {
          fields.push(quote_field(rawField));
          rowValues.push(`$${push_param(rawValue)}`);
        }
      }
      insertFields = fields;
      insertValues = [rowValues]; // just one
    }

    if (insertValues.length > 0) {
      queryText +=
        ` (${(() => {
          const result2: any[] = [];
          for (const field of Array.from(insertFields)) {
            result2.push(quote_field(field));
          }
          return result2;
        })().join(",")}) VALUES ` +
        (() => {
          const result3: any[] = [];
          for (const rowValues of Array.from(insertValues)) {
            result3.push(` (${rowValues.join(",")}) `);
          }
          return result3;
        })().join(",");
    }
  }

  if (opts.set != null) {
    const setAssignments: string[] = [];
    for (const rawField in opts.set) {
      const rawValue = opts.set[rawField];
      if (rawField.indexOf("::") !== -1) {
        let fieldName = rawField;
        let type: string | undefined;
        [fieldName, type] = Array.from(rawField.split("::"));
        fieldName = fieldName.trim();
        type = type.trim();
        setAssignments.push(
          `${quote_field(fieldName)}=$${push_param(rawValue, type)}::${type}`,
        );
        continue;
      } else {
        setAssignments.push(
          `${quote_field(rawField.trim())}=$${push_param(rawValue)}`,
        );
      }
    }
    if (setAssignments.length > 0) {
      SET.push(...setAssignments);
    }
  }

  if (opts.conflict != null) {
    if (
      misc.is_string(opts.conflict) &&
      misc.startswith(opts.conflict.toLowerCase().trim(), "on conflict")
    ) {
      // Straight string inclusion
      queryText += " " + opts.conflict + " ";
    } else {
      let conflict;
      if (opts.values == null) {
        if (typeof opts.cb === "function") {
          opts.cb(
            "if conflict is specified then values must also be specified",
          );
        }
        return;
      }
      if (!misc.is_array(opts.conflict)) {
        if (typeof opts.conflict !== "string") {
          if (typeof opts.cb === "function") {
            opts.cb(
              `conflict (='${misc.to_json(
                opts.conflict,
              )}') must be a string (the field name), for now`,
            );
          }
          return;
        } else {
          conflict = [opts.conflict];
        }
      } else {
        ({ conflict } = opts);
      }
      const conflictFields = insertFields;
      const updates = (() => {
        const result4: string[] = [];
        for (const field of Array.from(conflictFields)) {
          if (!Array.from(conflict).includes(field)) {
            result4.push(`${quote_field(field)}=EXCLUDED.${field}`);
          }
        }
        return result4;
      })();
      SET.push(...updates);
      if (SET.length === 0) {
        queryText += ` ON CONFLICT (${conflict.join(",")}) DO NOTHING `;
      } else {
        queryText += ` ON CONFLICT (${conflict.join(",")}) DO UPDATE `;
      }
    }
  }

  if (SET.length > 0) {
    queryText += " SET " + SET.join(" , ");
  }

  const WHERE: any[] = [];
  const push_where = (condition) => {
    if (typeof condition === "string") {
      return WHERE.push(condition);
    } else if (misc.is_array(condition)) {
      return (() => {
        const result5: any[] = [];
        for (const item of Array.from(condition)) {
          result5.push(push_where(item));
        }
        return result5;
      })();
    } else if (misc.is_object(condition)) {
      for (const cond in condition) {
        const value = condition[cond];
        if (typeof cond !== "string") {
          if (typeof opts.cb === "function") {
            opts.cb(`each condition must be a string but '${cond}' isn't`);
          }
          return;
        }
        if (value == null) {
          // *IGNORE* where conditions where value is explicitly undefined
          // Note that in SQL NULL is not a value and there is no way to use it in placeholder
          // anyways, so this can never work.
          continue;
        }
        let normalizedCond = cond;
        if (normalizedCond.indexOf("$") === -1) {
          // where condition is missing it's $ parameter -- default to equality
          normalizedCond += " = $";
        }
        WHERE.push(normalizedCond.replace("$", `$${push_param(value)}`));
      }
    }
  };

  if (opts.where != null) {
    push_where(opts.where);
  }

  if (WHERE.length > 0) {
    if (opts.values != null) {
      if (typeof opts.cb === "function") {
        opts.cb("values must not be given if where clause given");
      }
      return;
    }
    queryText += ` WHERE ${WHERE.join(" AND ")}`;
  }

  if (opts.order_by != null) {
    if (opts.order_by.indexOf("'") >= 0) {
      const err = `ERROR -- detected ' apostrophe in order_by='${opts.order_by}'`;
      dbg(err);
      if (typeof opts.cb === "function") {
        opts.cb(err);
      }
      return;
    }
    queryText += ` ORDER BY ${opts.order_by}`;
  }

  if (opts.limit != null) {
    if (!validator.isInt("" + opts.limit, { min: 0 })) {
      const err = `ERROR -- opts.limit = '${opts.limit}' is not an integer`;
      dbg(err);
      if (typeof opts.cb === "function") {
        opts.cb(err);
      }
      return;
    }
    queryText += ` LIMIT ${opts.limit} `;
  }

  if (opts.offset != null) {
    if (!validator.isInt("" + opts.offset, { min: 0 })) {
      const err = `ERROR -- opts.offset = '${opts.offset}' is not an integer`;
      dbg(err);
      if (typeof opts.cb === "function") {
        opts.cb(err);
      }
      return;
    }
    queryText += ` OFFSET ${opts.offset} `;
  }

  if (opts.safety_check) {
    const safety_check = queryText.toLowerCase().trim();
    if (
      (safety_check.startsWith("update") ||
        safety_check.startsWith("delete")) &&
      safety_check.indexOf("where") === -1 &&
      safety_check.indexOf("trigger") === -1 &&
      safety_check.indexOf("insert") === -1 &&
      safety_check.indexOf("create") === -1
    ) {
      // This is always a bug.
      const err = `ERROR -- Dangerous UPDATE or DELETE without a WHERE, TRIGGER, or INSERT:  query='${queryText}'`;
      dbg(err);
      if (typeof opts.cb === "function") {
        opts.cb(err);
      }
      return;
    }
  }

  let cacheKey: string | undefined;

  opts.query = queryText;

  if (opts.cache && dbAny._query_cache != null) {
    // check for cached result
    cacheKey = JSON.stringify([queryText, params]);
    const cachedResult = dbAny._query_cache.get(cacheKey) as
      | [unknown, unknown]
      | undefined;
    if (cachedResult != null) {
      dbg(`using cache for '${queryText}'`);
      if (typeof opts.cb === "function") {
        opts.cb(cachedResult[0] as any, cachedResult[1] as any);
      }
      return;
    }
  }

  // params can easily be huge, e.g., a blob.  But this may be
  // needed at some point for debugging.
  //dbg("query='#{opts.query}', params=#{misc.to_json(opts.params)}")
  const runQuery = async (): Promise<void> => {
    const client = await db._get_query_client();
    let released = false;
    const shouldRelease = db._query_client !== client;
    const releaseClient = (err?: unknown): void => {
      if (released || !shouldRelease) {
        return;
      }
      released = true;
      const releaseErr =
        err instanceof Error
          ? err
          : err != null
            ? new Error(String(err))
            : undefined;
      client.release(releaseErr);
    };
    if (db._concurrent_queries == null) {
      db._concurrent_queries = 0;
    }
    db._concurrent_queries += 1;
    dbg(`query='${queryText} (concurrent=${db._concurrent_queries})'`);

    if (dbAny.concurrent_counter != null) {
      dbAny.concurrent_counter.labels("started").inc(1);
    }
    try {
      let timer;
      const start = new Date();
      if (db._timeout_ms && db._timeout_delay_ms) {
        // Create a timer, so that if the query doesn't return within
        // timeout_ms time, then the entire connection is destroyed.
        // It then gets recreated automatically.  I tested
        // and all outstanding queries also get an error when this happens.
        const timeout_error = () => {
          // Only disconnect with timeout error if it has been sufficiently long
          // since connecting.   This way when an error is triggered, all the
          // outstanding timers at the moment of the error will just get ignored
          // when they fire (since @_connect_time is 0 or too recent).
          if (
            dbAny._connect_time &&
            db._timeout_delay_ms &&
            +new Date() - +dbAny._connect_time > db._timeout_delay_ms
          ) {
            return client.emit("error", "timeout");
          }
        };
        timer = setTimeout(timeout_error, db._timeout_ms);
      }

      // PAINFUL FACT: In client.query below, if the client is closed/killed/errored
      // (especially via client.emit above), then none of the callbacks from
      // client.query are called!
      let finished = false;
      const error_listener = function () {
        dbg("error_listener fired");
        return query_cb("error", undefined);
      };
      client.once("error", error_listener);
      var query_cb = (err, result) => {
        if (finished) {
          // ensure no matter what that query_cb is called at most once.
          dbg("called when finished (ignoring)");
          return;
        }
        finished = true;
        client.removeListener("error", error_listener);

        if (db._timeout_ms) {
          clearTimeout(timer);
        }
        const query_time_ms = +new Date() - +start;
        if (db._concurrent_queries != null) {
          db._concurrent_queries -= 1;
        }
        if (dbAny.query_time_histogram != null) {
          dbAny.query_time_histogram.observe(
            { table: opts.table != null ? opts.table : "" },
            query_time_ms,
          );
        }
        if (dbAny.concurrent_counter != null) {
          dbAny.concurrent_counter.labels("ended").inc(1);
        }
        if (err) {
          dbg(
            `done (concurrent=${db._concurrent_queries}), (query_time_ms=${query_time_ms}) -- error: ${err}`,
          );
          //# DANGER
          // Only uncomment this for low level debugging!
          //### dbg("params = #{JSON.stringify(opts.params)}")
          //#
          err = "postgresql " + err;
        } else {
          dbg(
            `done (concurrent=${db._concurrent_queries}) (query_time_ms=${query_time_ms}) -- success`,
          );
        }
        releaseClient(err);
        if (opts.cache && dbAny._query_cache != null && cacheKey != null) {
          dbAny._query_cache.set(cacheKey, [err, result]);
        }
        if (typeof opts.cb === "function") {
          opts.cb(err, result);
        }
        if (query_time_ms >= QUERY_ALERT_THRESH_MS) {
          return dbg(
            `QUERY_ALERT_THRESH: query_time_ms=${query_time_ms}\nQUERY_ALERT_THRESH: query='${queryText}'\nQUERY_ALERT_THRESH: params='${misc.to_json(
              params,
            )}'`,
          );
        }
      };

      // set a timeout for one specific query (there is a default when creating the pg.Client, see @_connect)
      if (
        opts.timeout_s != null &&
        typeof opts.timeout_s === "number" &&
        opts.timeout_s >= 0
      ) {
        dbg(`set query timeout to ${opts.timeout_s}secs`);
        if (opts.pg_params == null) {
          opts.pg_params = {};
        }
        // the actual param is in milliseconds
        // https://postgresqlco.nf/en/doc/param/statement_timeout/
        opts.pg_params.statement_timeout = 1000 * opts.timeout_s;
      }

      if (opts.pg_params != null) {
        dbg("run query with specific postgres parameters in a transaction");
        do_query_with_pg_params({
          client,
          query: queryText,
          params,
          pg_params: opts.pg_params,
          cb: query_cb,
        });
      } else {
        client.query(queryText, params, query_cb);
      }
    } catch (e) {
      // this should never ever happen
      dbg(`EXCEPTION in client.query: ${e}`);
      releaseClient(e);
      if (typeof opts.cb === "function") {
        opts.cb(e);
      }
      if (db._concurrent_queries != null) {
        db._concurrent_queries -= 1;
      }
      if (dbAny.concurrent_counter != null) {
        dbAny.concurrent_counter.labels("ended").inc(1);
      }
    }
  };

  void runQuery().catch((err) => {
    if (typeof opts.cb === "function") {
      opts.cb(err ?? "not connected");
    }
  });
}
