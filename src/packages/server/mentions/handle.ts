/*
Handle all mentions that haven't yet been handled.
*/

import getPool from "@cocalc/database/pool";
import { delay } from "awaiting";
import { getLogger } from "@cocalc/backend/logger";
import type { Action, Key } from "./types";
import notify from "./notify";

const logger = getLogger("mentions - handle");

// TODO: should be in the database server settings; also should be
// user configurable, and this is just a default
const minEmailInterval = "6 hours";
const maxPerInterval = 50; // up to 50 emails for a given chatroom every 6 hours.

// We check for new notifications this frequently.
const polIntervalSeconds = 15;

// Handle all notification, then wait for the given time, then again
// handle all unhandled notifications.
export default async function init(): Promise<void> {
  while (true) {
    try {
      await handleAllMentions();
    } catch (err) {
      logger.warn(`WARNING -- error handling mentions -- ${err}`);
    }

    await delay(polIntervalSeconds * 1000);
  }
}

async function handleAllMentions(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT time, project_id, path, source, target, description FROM mentions WHERE action IS null"
  );
  for (const row of rows) {
    const { time, project_id, path, source, target, description } = row;
    try {
      await handleMention(
        { project_id, path, time, target },
        source,
        description ?? ""
      );
    } catch (err) {
      logger.warn(
        `WARNING -- error handling mention (will try later) -- ${err}`
      );
    }
  }
}

async function handleMention(
  key: Key,
  source: string,
  description: string
): Promise<void> {
  // Check that source and target are both currently
  // collaborators on the project.
  const action: Action = await determineAction(key);
  try {
    switch (action) {
      case "ignore": // already recently notified about this chatroom.
        await setAction(key, action);
        return;
      case "notify":
        let whatDid = await notify(key, source, description);
        // record what we did.
        await setAction(key, whatDid);
        return;
      default:
        throw Error(`BUG: unknown action "${action}"`);
    }
  } catch (err) {
    await setError(key, action, `${err}`);
  }
}

async function determineAction(key: Key): Promise<Action> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM mentions WHERE project_id=$1 AND path=$2 AND target=$3 AND action = 'email' AND time >= NOW() - INTERVAL '${parseInt(
      minEmailInterval
    )}'`,
    [key.project_id, key.path, key.target]
  );
  const count: number = parseInt(rows[0]?.count ?? 0);
  if (count >= maxPerInterval) {
    return "ignore";
  }
  return "notify";
}

async function setAction(key: Key, action: Action): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE mentions SET action=$1 WHERE project_id=$2 AND path=$3 AND time=$4 AND target=$5",
    [action, key.project_id, key.path, key.time, key.target]
  );
}

async function setError(
  key: Key,
  action: Action,
  error: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE mentions SET action=$1, error=$2 WHERE project_id=$3 AND path=$4 AND time=$5 AND target=$6",
    [action, error, key.project_id, key.path, key.time, key.target]
  );
}
