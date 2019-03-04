/*
Handle all mentions that haven't yet been handled.
*/

import { callback2 } from "smc-util/async-utils";
import { callback, delay } from "awaiting";

const { send_email } = require("../email");

const { HELP_EMAIL, SITE_NAME } = require("smc-util/theme");

// Handle all notification, then wait for the given time, then again
// handle all unhandled notifications.
export async function handle_mentions_loop(
  db: any,
  wait_ms: number = 15000
): Promise<void> {
  while (true) {
    try {
      await handle_all_mentions(db);
    } catch (err) {
      console.warn(`WARNING -- error handling mentions -- ${err}`);
      console.trace();
    }

    await delay(wait_ms);
  }
}

export async function handle_all_mentions(db: any): Promise<void> {
  const result = await callback2(db._query, {
    select: ["time", "project_id", "path", "source", "target", "priority"],
    table: "mentions",
    where: "done is null or done=false"
  });
  if (result == null || result.rows == null) {
    throw Error("invalid result"); // can't happen
  }
  for (let row of result.rows) {
    const project_id: string = row.project_id;
    const path: string = row.path;
    const time: Date = row.time;
    const source: string = row.source;
    const target: string = row.target;
    const priority: number = row.priority;
    try {
      await handle_mention(
        db,
        project_id,
        path,
        time,
        source,
        target,
        priority
      );
    } catch (err) {
      await record_error(db, project_id, path, time, target, `${err}`);
    }
  }
}

export async function handle_mention(
  db,
  project_id: string,
  path: string,
  time: Date,
  source: string,
  target: string,
  _priority: number
): Promise<void> {
  // Check that source and target are both currently
  // collaborators on the project.
  // TODO...

  // Gather relevant information to use to construct notification.
  const user_names = await callback2(db.account_ids_to_usernames, {
    account_ids: [source]
  });
  const source_name = `${user_names[source].first_name} ${
    user_names[source].last_name
  }`;
  const project_title = await callback(
    db._get_project_column,
    "title",
    project_id
  );
  const subject = `${SITE_NAME} Notification`;
  const body = `${source_name} mentioned you in a chat at ${path} in ${project_title}`;
  // TODO: body should probably have a link...
  let source_email: string = await callback(
    db.get_user_column,
    "email_address",
    source
  );
  let from: string;
  if (source_email) {
    from = `${source_name} <${source_email}>`;
  } else {
    // maybe they have no email
    from = `CoCalc <${HELP_EMAIL}>`;
  }
  const to = await callback(db.get_user_column, "email_address", target);
  if (!to) {
    throw Error("no implemented way to notify target (no known email address)");
  }

  const category = "notification";

  // Send email notification.
  await callback2(send_email, { subject, body, from, to, category });

  // Mark done
  await callback2(db._query, {
    query: "UPDATE mentions SET done=true",
    where: { project_id, path, time, target }
  });
}

export async function record_error(
  db,
  project_id: string,
  path: string,
  time: Date,
  target: string,
  error: string
): Promise<void> {
  await callback2(db._query, {
    query: "UPDATE mentions SET done=true,error=$1",
    where: { project_id, path, time, target },
    params: [error]
  });
}
