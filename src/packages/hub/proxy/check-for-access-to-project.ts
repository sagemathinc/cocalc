import LRU from "lru-cache";
import { callback2 } from "@cocalc/util/async-utils";
import getLogger from "../logger";
import { database } from "../servers/database";
const {
  user_has_write_access_to_project,
  user_has_read_access_to_project,
} = require("../access");
import generateHash from "@cocalc/server/auth/hash";
import { getAccountWithApiKey } from "@cocalc/server/api/manage";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import isBanned from "@cocalc/server/accounts/is-banned";

const logger = getLogger("proxy:has-access");

interface Options {
  project_id: string;
  remember_me?: string;
  api_key?: string;
  type: "write" | "read";
  isPersonal: boolean;
}

// 1 minute cache: grant "yes" for a while
const yesCache = new LRU({ max: 20000, ttl: 1000 * 60 * 1.5 });
// 5 second cache: recheck "no" much more frequently
const noCache = new LRU({ max: 20000, ttl: 1000 * 15 });

export default async function hasAccess(opts: Options): Promise<boolean> {
  if (opts.isPersonal) {
    // In personal mode, anyone who can access localhost has full
    // access to everything, since this is meant to be used on
    // single-user personal computer in a context where there is no
    // security requirement at all.
    return true;
  }

  const { project_id, remember_me, api_key, type } = opts;
  const key = `${project_id}${remember_me}${api_key}${type}`;

  for (const cache of [yesCache, noCache]) {
    if (cache.has(key)) {
      return !!cache.get(key);
    }
  }

  // not cached, so we determine access.
  let access: boolean;
  const dbg = (...args) => {
    logger.debug(type, " access to ", project_id, ...args);
  };

  try {
    access = await checkForAccess({
      project_id,
      remember_me,
      api_key,
      type,
      dbg,
    });
  } catch (err) {
    dbg("error trying to determine access; denying for now", `${err}`);
    access = false;
  }
  dbg("determined that access=", access);

  if (access) {
    yesCache.set(key, access);
  } else {
    noCache.set(key, access);
  }
  return access;
}

async function checkForAccess({
  project_id,
  remember_me,
  api_key,
  type,
  dbg,
}): Promise<boolean> {
  if (remember_me) {
    const { access, error } = await checkForRememberMeAccess({
      project_id,
      remember_me,
      type,
      dbg,
    });
    if (access) {
      return access;
    }
    if (!api_key) {
      // only finish if no api key:
      if (error) {
        throw Error(error);
      } else {
        return access;
      }
    }
  }

  if (api_key) {
    const { access, error } = await checkForApiKeyAccess({
      project_id,
      api_key,
      type,
      dbg,
    });
    if (access) {
      return access;
    }
    if (error) {
      throw Error(error);
    }
    return access;
  }

  throw Error(
    "you must authenticate with either an api_key or remember_me cookie, but neither is set",
  );
}

async function checkForRememberMeAccess({
  project_id,
  remember_me,
  type,
  dbg,
}): Promise<{ access: boolean; error?: string }> {
  dbg("get remember_me message");
  const x = remember_me.split("$");
  const hash = generateHash(x[0], x[1], parseInt(x[2]), x[3]);
  const signed_in_mesg = await callback2(database.get_remember_me, {
    hash,
    cache: true,
  });
  if (signed_in_mesg == null) {
    return { access: false, error: "not signed in via remember_me" };
  }

  let access: boolean = false;
  const { account_id, email_address } = signed_in_mesg;
  if (await isBanned(account_id)) {
    return { access: false, error: "banned" };
  }
  dbg({ account_id, email_address });

  dbg(`now check if user has access to project`);
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
    return { access: false, error: `invalid access type ${type}` };
  }
  return { access };
}

async function checkForApiKeyAccess({ project_id, api_key, type, dbg }) {
  // we don't have a notion of "read" access, for type.
  dbg("checkForApiKeyAccess", { project_id, type });
  const user = await getAccountWithApiKey(api_key);
  if (user == null) {
    dbg("api key is not valid (probably expired)");
    return { access: false, error: "invalid or expired api key" };
  }
  if (user.project_id) {
    return { access: user.project_id == project_id };
  }
  return {
    access: await isCollaborator({ account_id: user.account_id!, project_id }),
  };
}
