/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// PostgreSQL trigger code generation functions
// Migrated from postgres-synctable.coffee

import * as misc from "@cocalc/util/misc";
import { sha1 } from "@cocalc/backend/misc_node";

import type { ChangefeedSelect } from "../postgres/types";

// Import quote_field from postgres-base (still CoffeeScript)
const base = (() => {
  try {
    return require("../dist/postgres-base");
  } catch (err) {
    return require("../postgres-base");
  }
})();
const { quote_field } = base;

/**
 * Generate a consistent trigger name based on table, select columns, and watch columns
 * @param table - Table name
 * @param select - Map of column names to PostgreSQL types
 * @param watch - Array of column names to watch for changes
 * @returns Trigger name in format 'change_<hash>'
 */
export function trigger_name(
  table: string,
  select: ChangefeedSelect,
  watch: string[],
): string {
  if (!misc.is_object(select)) {
    throw Error("trigger_name -- columns must be a map of colname:type");
  }
  let c = misc.keys(select);
  c.sort();
  watch = misc.copy(watch);
  watch.sort();
  if (watch.length > 0) {
    c.push("|");
    c = c.concat(watch);
  }
  return "change_" + sha1(`${table} ${c.join(" ")}`).slice(0, 16);
}

/**
 * Convert PostgreSQL type names for trigger variable declarations
 * @param type - PostgreSQL type
 * @returns Converted type (SERIAL UNIQUE → INTEGER, others unchanged)
 */
export function triggerType(type: string): string {
  if (type === "SERIAL UNIQUE") {
    return "INTEGER";
  } else {
    return type;
  }
}

/**
 * Generate PLPGSQL trigger function and CREATE TRIGGER statement
 * @param table - Table name
 * @param select - Map of column names to PostgreSQL types (columns to include in notification)
 * @param watch - Array of column names to watch for changes (trigger only fires if these change)
 * @returns Object with 'function' (PLPGSQL code) and 'trigger' (CREATE TRIGGER statement)
 */
export function trigger_code(
  table: string,
  select: ChangefeedSelect,
  watch: string[],
): { function: string; trigger: string } {
  const tgname = trigger_name(table, select, watch);

  // Generate variable declarations for OLD and NEW values
  const column_decl_old: string[] = [];
  const column_decl_new: string[] = [];
  for (const field in select) {
    const type = select[field];
    column_decl_old.push(`${field}_old ${triggerType(type) ?? "text"};`);
    column_decl_new.push(`${field}_new ${triggerType(type) ?? "text"};`);
  }

  // Generate assignment statements
  const assign_old: string[] = [];
  const assign_new: string[] = [];
  for (const field in select) {
    assign_old.push(`${field}_old = OLD.${field};`);
    assign_new.push(`${field}_new = NEW.${field};`);
  }

  // Generate json_build_object arguments
  const build_obj_old: string[] = [];
  const build_obj_new: string[] = [];
  for (const field in select) {
    build_obj_old.push(`'${field}', ${field}_old`);
    build_obj_new.push(`'${field}', ${field}_new`);
  }

  // Generate change detection condition
  let no_change: string;
  if (watch.length > 0) {
    const comparisons: string[] = [];
    for (const field of watch.concat(misc.keys(select))) {
      comparisons.push(`OLD.${field} = NEW.${field}`);
    }
    no_change = comparisons.join(" AND ");
  } else {
    no_change = "FALSE";
  }

  // Generate UPDATE OF clause
  let update_of: string;
  if (watch.length > 0) {
    const x: Record<string, boolean> = {};
    for (const k of watch) {
      x[k] = true;
    }
    for (const k of misc.keys(select)) {
      x[k] = true;
    }
    const fields: string[] = [];
    for (const field of misc.keys(x)) {
      fields.push(quote_field(field));
    }
    update_of = `OF ${fields.join(",")}`;
  } else {
    update_of = "";
  }

  const code = {
    function: `CREATE OR REPLACE FUNCTION ${tgname}() RETURNS TRIGGER AS $$
    DECLARE
        notification json;
        obj_old json;
        obj_new json;
        ${column_decl_old.join("\n        ")}
        ${column_decl_new.join("\n        ")}
    BEGIN
        -- TG_OP is 'DELETE', 'INSERT' or 'UPDATE'
        IF TG_OP = 'DELETE' THEN
            ${assign_old.join("\n            ")}
            obj_old = json_build_object(${build_obj_old.join(",")});
        END IF;
        IF TG_OP = 'INSERT' THEN
            ${assign_new.join("\n            ")}
            obj_new = json_build_object(${build_obj_new.join(",")});
        END IF;
        IF TG_OP = 'UPDATE' THEN
            IF ${no_change} THEN
                RETURN NULL;
            END IF;
            ${assign_old.join("\n            ")}
            obj_old = json_build_object(${build_obj_old.join(",")});
            ${assign_new.join("\n            ")}
            obj_new = json_build_object(${build_obj_new.join(",")});
        END IF;
        notification = json_build_array(TG_OP, obj_new, obj_old);
        PERFORM pg_notify('${tgname}', notification::text);
        RETURN NULL;
    END;
$$ LANGUAGE plpgsql;`,
    trigger: `CREATE TRIGGER ${tgname} AFTER INSERT OR DELETE OR UPDATE ${update_of} ON ${table} FOR EACH ROW EXECUTE PROCEDURE ${tgname}();`,
  };

  return code;
}

/*
 * HISTORICAL NOTE: Alternative Implementation for Large Notifications
 *
 * The following describes a way to back the changes with a small table.
 * This allows handling changes which are larger than the hard 8000 bytes limit
 * of PostgreSQL NOTIFY payloads.
 *
 * This was designed by HSY as a potential workaround for large notification payloads.
 * See: https://github.com/sagemathinc/cocalc/issues/1718
 *
 * Implementation approach (not currently used):
 *
 * 1. Create a table trigger_notifications via the db-schema.
 *    For performance reasons, the table should be created with "UNLOGGED"
 *    See: https://www.postgresql.org/docs/current/static/sql-createtable.html
 *
 *    schema.trigger_notifications = {
 *      primary_key: 'id',
 *      fields: {
 *        id: {
 *          type: 'uuid',
 *          desc: 'primary key'
 *        },
 *        time: {
 *          type: 'timestamp',
 *          desc: 'time of when the change was created -- used for TTL'
 *        },
 *        notification: {
 *          type: 'map',
 *          desc: "notification payload -- up to 1GB"
 *        }
 *      },
 *      pg_indexes: ['time']
 *    };
 *
 * 2. Modify the trigger function created by trigger_code above such that
 *    pg_notify no longer contains the data structure, but a UUID for an entry
 *    in the trigger_notifications table. The trigger creates that UUID and
 *    stores the data via a normal insert:
 *
 *    notification_id = md5(random()::text || clock_timestamp()::text)::uuid;
 *    notification = json_build_array(TG_OP, obj_new, obj_old);
 *    INSERT INTO trigger_notifications(id, time, notification)
 *    VALUES(notification_id, NOW(), notification);
 *
 * 3. PostgreSQL::_notification is modified to look up that UUID in the
 *    trigger_notifications table:
 *
 *    this._query({
 *      query: `SELECT notification FROM trigger_notifications WHERE id ='${mesg.payload}'`,
 *      cb: (err, result) => {
 *        if (err) {
 *          dbg(`err=${err}`);
 *        } else {
 *          payload = result.rows[0].notification;
 *          this.emit(mesg.channel, payload);
 *        }
 *      }
 *    });
 *
 *    Note: No string -> json conversion is necessary.
 *
 * 4. Implement a TTL (Time To Live) for the trigger_notifications table.
 *    The date_trunc is a good idea because there is just one lock + delete op
 *    per minute, instead of potentially at every write:
 *
 *    -- 10 minutes TTL for the trigger_notifications table, deleting only every full minute
 *
 *    CREATE FUNCTION delete_old_trigger_notifications() RETURNS trigger
 *        LANGUAGE plpgsql
 *        AS $$
 *    BEGIN
 *      DELETE FROM trigger_notifications
 *      WHERE time < date_trunc('minute', NOW() - '10 minute'::interval);
 *      RETURN NULL;
 *    END;
 *    $$;
 *
 *    -- Creating the trigger
 *
 *    CREATE TRIGGER trigger_delete_old_trigger_notifications
 *      AFTER INSERT ON trigger_notifications
 *      EXECUTE PROCEDURE delete_old_trigger_notifications();
 *
 */
