import * as LRU from "lru-cache";
import { callback2 } from "smc-util/async-utils";
import getLogger from "../logger";
import { database } from "../servers/database";
const {
  user_has_write_access_to_project,
  user_has_read_access_to_project,
} = require("../access");
import { generate_hash } from "../auth";
const winston = getLogger("proxy: has-access");

interface Options {
  project_id: string;
  remember_me: string;
  type: "write" | "read";
  isPersonal: boolean;
}

// 5 minute cache: grant "yes" for a while
const yesCache = new LRU({ max: 20000, maxAge: 1000 * 60 * 5 });
// 10 second cache: recheck "no" more frequently
const noCache = new LRU({ max: 20000, maxAge: 1000 * 10 });

export default async function hasAccess(opts: Options): Promise<boolean> {
  if (opts.isPersonal) {
    // In personal mode, anyone who can access localhost has full
    // access to everything, since this is meant to be used on
    // single-user personal computer.
    return true;
  }

  const { project_id, remember_me, type } = opts;

  const key = project_id + remember_me + type;

  for (const cache of [yesCache, noCache]) {
    if (cache.has(key)) return !!cache.get(key);
  }

  // not cached, so we have to determine access.
  let access: boolean;
  const dbg = (m) => {
    winston.debug(`${type} access to ${project_id}: ${m}`);
  };

  try {
    dbg("get remember_me message");
    const x = remember_me.split("$");
    const hash = generate_hash(x[0], x[1], x[2], x[3]);
    const signed_in_mesg = await callback2(database.get_remember_me, {
      hash,
      cache: true,
    });
    if (signed_in_mesg == null) {
      throw Error("not signed in");
    }
    const { account_id, email_address } = signed_in_mesg;
    dbg(`account_id="${account_id}", email_address="${email_address}"`);

    dbg(`now check if user has ${type} access to project`);
    if (type === "write") {
      access = await callback2(user_has_write_access_to_project, {
        database,
        project_id,
        account_id,
      });
      if (access) {
        // Record that user is going to actively access
        // this project.  This is important since it resets
        // the idle timeout.
        database.touch({
          account_id,
          project_id,
        });
      }
    } else if (type == "read") {
      access = await callback2(user_has_read_access_to_project, {
        database,
        project_id,
        account_id,
      });
    } else {
      throw Error(`invalid access type ${type}`);
    }
  } catch (err) {
    dbg(`error trying to determine access; denying for now -- ${err}`);
    access = false;
  }

  if (access) {
    yesCache.set(key, access);
  } else {
    noCache.set(key, access);
  }
  return access;
}
