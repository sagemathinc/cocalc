import { ACCOUNT_ID, PROJECT_ID } from "../const";
import * as misc from "@cocalc/util/misc";

interface Option {
  set?: boolean;
}

// this is used for the changefeed above, and also set queries (and non-changefeed gets) from
// the ./api.ts module.
export default async function userQuery({
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
}): Promise<any> {
  console.log(
    "userQuery",
    require("util").inspect({ query, changes }, { depth: undefined }),
  );

  if (changes && cb == null) {
    throw Error("if changes is set then cb must also be set.");
  }

  const subs = {
    "{account_id}": ACCOUNT_ID,
    "{project_id}": PROJECT_ID,
    "{now}": new Date(),
  };
  query = misc.deep_copy(query);
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
  isSetQuery ??= !misc.has_null_leaf(query);
  const f = isSetQuery ? userSetQuery : userGetQuery;
  try {
    const result = await f(query, options, changes, cb);
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

async function userGetQuery(
  query: object,
  _options: object[],
  _changes: string | undefined,
  _cb?: Function, // only used when changes set, and then only used for updates
) {
  const table = Object.keys(query)[0];
  const isMulti = misc.is_array(query[table]);
  let result: any = isMulti ? [] : {};

  if (table == "accounts") {
    result = {
      account_id: ACCOUNT_ID,
      email_address: "user@cocalc.com",
    };
    if (isMulti) {
      result = [result];
    }
  }

  return { [table]: result };
}

async function userSetQuery(query: object, options: object[]) {
  console.log("userSetQuery", query, options);
}
