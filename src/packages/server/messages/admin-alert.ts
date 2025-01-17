/*
Send a message from "the system" to all admin's of this site.

Messages appear in email periodically...

Makes from_id be the support account, unless there isn't support, in which case it
uses the first admin account.

If there are no admins, silently do nothing.  I.e., this
sends a message to all admins, which is an empty task when
there are no admins.

IMPORTANT: it's safe to call this without awaiting.  It will never raise an exception
unless you explicitly pass in errorOnFail, which you should do if you want to be very
certain the message is delivered. This would only fail if the connection to our database
is broken.

*/

import { getLogger } from "@cocalc/backend/logger";
import { db } from "@cocalc/database";
import getAdmins from "@cocalc/server/accounts/admins";
import send from "./send";

const logger = getLogger("server:messages:admin");

function getStackTrace() {
  const obj = {};
  Error.captureStackTrace(obj, getStackTrace);
  // @ts-ignore
  return obj.stack;
}

function toString(x: any) {
  if (typeof x == "string") {
    return x;
  }
  try {
    const y = `${x}`;
    if (y == "[object Object]") {
      try {
        return JSON.stringify(x);
      } catch (err) {
        return y;
      }
    }
    return y;
  } catch (err) {
    return "";
  }
}

export default async function adminAlert({
  subject,
  body = "",
  errorOnFail,
  stackTrace,
  dedupMinutes = 60 * 4,
}: {
  subject: string;
  body?: any;
  errorOnFail?: boolean;
  stackTrace?: boolean;
  // If you try to send the exact same admin alert more often than this, then it is dropped
  dedupMinutes?: number;
}): Promise<number | undefined> {
  const stack = stackTrace
    ? "\n\n---\n" + "```js\n" + getStackTrace() + "\n```\n"
    : "";
  try {
    logger.debug("mesg", { subject, body });
    const to_ids = await getAdmins();
    if (to_ids.length == 0) {
      logger.debug("no admins so nothing to do");
      return;
    }
    return await send({
      subject: `Admin Alert - ${subject}`,
      body: toString(body) + stack,
      to_ids,
      dedupMinutes,
    });
  } catch (err) {
    if (errorOnFail) {
      throw err;
    } else {
      logger.debug(`failed due to database error -- ignoring -- ${err}`);
    }
  }
}

export function enableDbAdminAlerts() {
  // Set adminAlerts on the db singleton (which is implemented in coffeescript).
  db().adminAlert = adminAlert;
}
