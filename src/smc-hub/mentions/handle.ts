/*
Handle all mentions that haven't yet been handled.
*/

const MIN_EMAIL_INTERVAL: string = "8 hours";

import { callback2 } from "smc-util/async-utils";
import { trunc } from "smc-util/misc2";
import { callback, delay } from "awaiting";

const { send_email } = require("../email");

const { HELP_EMAIL } = require("smc-util/theme");

// TODO: should be something like notifications@cocalc.com...
const NOTIFICATIONS_EMAIL = HELP_EMAIL;

// Determine entry in mentions table.
interface Key {
  project_id: string;
  path: string;
  time: Date;
  target: string;
}

type Action = "email" | "ignore";

type Database = any; // TODO

// Handle all notification, then wait for the given time, then again
// handle all unhandled notifications.
export async function handle_mentions_loop(
  db: Database,
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
    where: "action is null" // no action taken yet.
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
    await handle_mention(
      db,
      { project_id, path, time, target },
      source,
      priority
    );
  }
}

async function determine_action(db: Database, key: Key): Promise<Action> {
  const { project_id, path, target } = key;
  const result = await callback2(db._query, {
    query: `SELECT COUNT(*) FROM mentions WHERE project_id=$1 AND path=$2 AND target=$3 AND action = 'email' AND time >= NOW() - INTERVAL '${MIN_EMAIL_INTERVAL}'`,
    params: [project_id, path, target]
  });
  const count: number = parseInt(result.rows[0].count);
  if (count > 0) {
    return "ignore";
  }
  return "email";
}

export async function handle_mention(
  db: Database,
  key: Key,
  source: string,
  _priority: number // ignored for now.
): Promise<void> {
  // Check that source and target are both currently
  // collaborators on the project.
  const action: string = await determine_action(db, key);
  try {
    switch (action) {
      case "ignore":
        // Mark that we ignore this.
        await set_action(db, key, "ignore");
        return;
      case "email":
        await send_email_notification(db, key, source);
        // Mark that we sent email.
        await set_action(db, key, "email");
        return;
      default:
        throw Error(`unknown action "${action}"`);
    }
  } catch (err) {
    await record_error(db, key, action, `${err}`);
  }
}

async function send_email_notification(
  db: Database,
  key: Key,
  source: string
): Promise<void> {
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
    key.project_id
  );
  const subject = `[${trunc(project_title, 40)}] ${key.path}`;
  const url = `https://cocalc.com/projects/${key.project_id}/files/${key.path}`;
  const body = `${source_name} mentioned you in <a href="${url}">a chat at ${
    key.path
  } in ${project_title}</a>.`;
  let from: string;
  from = `${source_name} <${NOTIFICATIONS_EMAIL}>`;
  const to = await callback(db.get_user_column, "email_address", key.target);
  if (!to) {
    throw Error("no implemented way to notify target (no known email address)");
  }

  const category = "notification";

  // Send email notification.
  await callback2(send_email, { subject, body, from, to, category });
}

async function set_action(
  db: Database,
  key: Key,
  action: string
): Promise<void> {
  await callback2(db._query, {
    query: "UPDATE mentions SET action=$1",
    params: [action],
    where: key
  });
}

export async function record_error(
  db,
  key: Key,
  action: string,
  error: string
): Promise<void> {
  await callback2(db._query, {
    query: "UPDATE mentions SET action=$1,error=$2",
    where: key,
    params: [action, error]
  });
}
