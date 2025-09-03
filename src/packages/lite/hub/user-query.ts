/*
Development

You have to have a server running (say on port 30000).  Then:


  unset COCALC_PROJECT_ID; PORT=30000 DEBUG_CONSOLE=yes DEBUG=cocalc:*  node

  Welcome to [...]

  > a = require('@cocalc/backend/conat'); b = require('@cocalc/lite/hub/user-query'); await b.init(a.conat())
  
  > kv = await a.conat().sync.dkv({name:'database'})

  > await b.default({query:{accounts:[{email_address:null}]}})
  userQuery {
    query: { accounts: [ { email_address: null } ] },
    changes: undefined
  }
  {
    accounts: [
      {
        account_id: '00000000-0000-4000-8000-000000000000',
        email_address: 'user@cocalc.com'
      }
    ]
  }

*/

import { account_id } from "@cocalc/backend/data";
import { project_id } from "@cocalc/project/data";
import * as misc from "@cocalc/util/misc";
import type { DKV } from "@cocalc/conat/sync/dkv";
import { cloneDeep, isEqual } from "lodash";
import { client_db, SCHEMA } from "@cocalc/util/schema";

interface Option {
  set?: boolean;
}

// this is used for the changefeed above, and also set queries (and non-changefeed gets) from
// the ./api.ts module.
export default function userQuery({
  query,
  changes,
  options,
  cb,
}: {
  query: object;
  options?: Option[];
  account_id?: string;
  changes?: string;
  // if cb is given uses cb interface -- if not given, uses async interface
  cb?: Function;
}) {
  if (changes && cb == null) {
    throw Error("if changes is set then cb must also be set.");
  }

  const subs = {
    "{account_id}": account_id,
    "{project_id}": project_id,
    "{now}": new Date(),
  };
  query = cloneDeep(query);
  misc.obj_key_subs(query, subs);

  let isSetQuery;
  if (options != null) {
    if (!misc.is_array(options)) {
      if (cb == null) {
        throw Error("options must be an array");
      } else {
        cb("options must be an array");
      }
      return;
    }
    for (const x of options) {
      if (x.set != null) {
        isSetQuery = !!x.set;
        options = options.filter((x) => !x.set);
        break;
      }
    }
  } else {
    options = [];
  }
  isSetQuery ??= misc.is_array(query) || !misc.has_null_leaf(query);
  const f = isSetQuery ? userSetQuery : userGetQuery;
  try {
    const result = f(query, options, changes, cb);
    if (cb != null) {
      cb(undefined, result);
    } else {
      return result;
    }
  } catch (err) {
    if (cb != null) {
      cb(`${err}`);
    } else {
      throw err;
    }
  }
}

let kv: DKV;
export { kv };
export async function init(client) {
  if (kv != null) {
    return;
  }
  kv = await client.sync.dkv({ name: "database" });
  if (kv.get("accounts") == null) {
    kv.set("accounts", [
      {
        account_id,
        email_address: "user@cocalc.com",
      },
    ]);
  }
  if (kv.get("projects") == null) {
    kv.set("projects", [
      {
        project_id,
        title: "CoCalc Lite",
        state: { state: "running" },
      },
    ]);
  }
}

function userGetQuery(
  query: object,
  _options: object[],
  _changes: string | undefined,
  _cb?: Function, // only used when changes set, and then only used for updates
) {
  const table = Object.keys(query)[0];
  const isMulti = misc.is_array(query[table]);
  const rows = kv.get(table) ?? [];

  // find all matches

  let matches;
  if (isMulti) {
    matches = search(table, rows, query[table][0], false);
  } else {
    matches = search(table, rows, query[table], true);
  }
  const fields = Object.keys(isMulti ? query[table][0] : query[table]);
  const v: any[] = [];
  for (const x of matches) {
    const y: any = {};
    for (const field of fields) {
      y[field] = x[field];
    }
    v.push(y);
  }
  setDefaults(table, v, fields);

  return { [table]: isMulti ? v : v[0] };
}

function userSetQuery(query: object, options: object[]) {
  if (misc.is_array(query)) {
    for (const q of query) {
      userSetQuery(q, options);
    }
    return;
  }
  const table = Object.keys(query)[0];
  const obj = query[table];
  const rows = cloneDeep(kv.get(table) ?? []);
  const row = search(table, rows, obj, true)[0];
  if (row != null) {
    // found a match -- we set that one with changed values
    // in obj and return
    for (const key in obj) {
      // todo: probably need to use schema instead
      
      // here it is important that arrays get replaced, whereas objects really
      // are maps so merge:
      row[key] = misc.is_object(row[key])
        ? { ...row[key], ...obj[key] }
        : obj[key];
    }
    kv.set(table, rows);
    return;
  }
  // no matches, so insert new row
  rows.push(obj);
  kv.set(table, rows);
}

function primaryKeys(table): string[] {
  return client_db.primary_keys(table);
}

// todo -- project log can be really big so we'll need to refactor this...
function search(
  table: string,
  rows: object[],
  obj: object,
  one: boolean = false,
): object[] {
  const v = primaryKeys(table).filter((key) => obj[key] != null);
  const matches: any[] = [];
  for (const row of rows) {
    let found = true;
    for (const key of v) {
      if (!isEqual(row[key], obj[key])) {
        found = false;
        break;
      }
    }
    if (found) {
      matches.push(row);
      if (one) {
        break;
      }
    }
  }
  return matches;
}

// fill in the default values for obj using the client_query spec.

function setDefaults(table, obj: object[], fields: string[]) {
  if (obj.length == 0 || fields.length == 0) {
    return;
  }
  const client_query = SCHEMA[table].user_query;
  if (client_query == null) {
    return;
  }
  const s = client_query.get?.fields ?? {};
  for (const k of fields) {
    const v = s[k];
    if (v == null) continue;
    // k is a field for which a default value (=v) is
    // provided in the schema.
    for (const x of obj) {
      if (x == null) continue;
      // We check to see if the field k was set on that object:
      const y = x[k];
      if (y == null) {
        // It was NOT set, so we deep copy the default value for the field k.
        x[k] = cloneDeep(v);
      } else if (
        typeof v == "object" &&
        typeof y == "object" &&
        !misc.is_array(v)
      ) {
        // y *is* defined and is an object, so we merge in the provided defaults.
        for (const k0 in v) {
          if (y[k0] == null) {
            y[k0] = v[k0];
          }
        }
      }
    }
  }
}

export function cancelQuery(_id: string) {}
