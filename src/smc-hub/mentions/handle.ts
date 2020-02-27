/*
Handle all mentions that haven't yet been handled.
*/

const MIN_EMAIL_INTERVAL: string =
  process.env.COCALC_MENTIONS_MIN_EMAIL_INTERVAL || "8 hours";

// How long to wait between each round of handling notifications.
let POLL_INTERVAL_S: number;
if (process.env.COCALC_MENTIONS_POLL_INTERVAL_S != undefined) {
  POLL_INTERVAL_S = parseInt(process.env.COCALC_MENTIONS_POLL_INTERVAL_S);
} else {
  POLL_INTERVAL_S = 15;
}

import { callback2 } from "smc-util/async-utils";
import { trunc } from "smc-util/misc2";
import { callback, delay } from "awaiting";

import { project_has_network_access } from "../postgres/project-queries";
import { is_paying_customer } from "../postgres/account-queries";

import { send_email } from "../email";

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

type Action = "email" | "ignore" | "no-network";

import { PostgreSQL } from "../postgres/types";

// Handle all notification, then wait for the given time, then again
// handle all unhandled notifications.
export async function handle_mentions_loop(
  db: PostgreSQL,
  poll_interval_s: number = POLL_INTERVAL_S
): Promise<void> {
  while (true) {
    try {
      await handle_all_mentions(db);
    } catch (err) {
      console.warn(`WARNING -- error handling mentions -- ${err}`);
      console.trace();
    }

    await delay(poll_interval_s * 1000);
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
  for (const row of result.rows) {
    const project_id: string = row.project_id;
    const path: string = row.path;
    const time: Date = row.time;
    const source: string = row.source;
    const target: string = row.target;
    const priority: number = row.priority;
    const description: string = row.description;
    await handle_mention(
      db,
      { project_id, path, time, target },
      source,
      priority,
      description
    );
  }
}

async function determine_action(
  db: PostgreSQL,
  key: Key,
  source: string
): Promise<Action> {
  const { project_id, path, target } = key;
  if (
    !(await is_paying_customer(db, source)) &&
    !(await project_has_network_access(db, project_id))
  ) {
    // Mentions are ignored when sending is NOT a paying customer *and*
    // the project does not have network access.
    // Otherwise, spammers could use @mentions to send emails.
    // Users can still see mentions inside CoCalc itself...
    return "no-network";
  }
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
  db: PostgreSQL,
  key: Key,
  source: string,
  _priority: number, // ignored for now.
  description?: string
): Promise<void> {
  // Check that source and target are both currently
  // collaborators on the project.
  const action: string = await determine_action(db, key, source);
  try {
    switch (action) {
      case "ignore":
        // Mark that we ignore this.
        await set_action(db, key, "ignore");
        return;
      case "no-network":
        // Mark that we ignore this because no network. (basically a trial user)
        await set_action(db, key, "no-network");
        return;
      case "email":
        await send_email_notification(db, key, source, description);
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
  db: PostgreSQL,
  key: Key,
  source: string,
  description: string = ""
): Promise<void> {
  // Gather relevant information to use to construct notification.
  const user_names = await callback2(db.account_ids_to_usernames, {
    account_ids: [source]
  });
  const source_name = `${user_names[source].first_name} ${user_names[source].last_name}`;
  const project_title = await callback(
    db._get_project_column,
    "title",
    key.project_id
  );
  const context =
    description.length > 0
      ? `<br/><blockquote>${description}</blockquote>`
      : "";
  const subject = `[${trunc(project_title, 40)}] ${key.path}`;
  const url = `https://cocalc.com/projects/${key.project_id}/files/${key.path}`;
  const body = `${source_name} mentioned you in <a href="${url}">a chat at ${key.path} in ${project_title}</a>.${context}`;
  let from: string;
  from = `${source_name} <${NOTIFICATIONS_EMAIL}>`;
  const to = await callback(db.get_user_column, "email_address", key.target);
  if (!to) {
    throw Error("no implemented way to notify target (no known email address)");
  }

  const category = "notification";

  const settings = await callback2(db.get_server_settings_cached, {});

  // Send email notification.
  await callback2(send_email, { subject, body, from, to, category, settings });
}

async function set_action(
  db: PostgreSQL,
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
