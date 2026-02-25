/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";
import { to_json } from "@cocalc/util/misc";

interface AccountCreationActionsSetOptions {
  email_address: string;
  action: any;
  ttl?: number;
}

interface AccountCreationActionsGetOptions {
  email_address: string;
}

interface AccountCreationActionsSuccessOptions {
  account_id: string;
}

interface DoAccountCreationActionsOptions {
  email_address: string;
  account_id: string;
}

/**
 * Helper function to create a timestamp in the future.
 * Returns a Date object `ttl` seconds in the future.
 */
function expireTime(ttl?: number): Date | undefined {
  if (ttl) {
    return new Date(Date.now() + ttl * 1000);
  }
  return undefined;
}

/**
 * Set or get account creation actions for an email address.
 *
 * If `action` is provided, adds a new action with the specified TTL (default: 2 weeks).
 * If `action` is not provided, returns all non-expired actions for the email.
 */
export async function accountCreationActions(
  db: PostgreSQL,
  opts: AccountCreationActionsSetOptions | AccountCreationActionsGetOptions,
): Promise<void | any[]> {
  const optsWithAction = opts as AccountCreationActionsSetOptions;

  if (optsWithAction.action != null) {
    // Add action
    const ttl = optsWithAction.ttl ?? 60 * 60 * 24 * 14; // Default: 2 weeks
    await db.async_query({
      query: "INSERT INTO account_creation_actions",
      values: {
        "id            :: UUID": (await import("@cocalc/util/misc")).uuid(),
        "email_address :: TEXT": opts.email_address,
        "action        :: JSONB": optsWithAction.action,
        "expire        :: TIMESTAMP": expireTime(ttl),
      },
    });
  } else {
    // Query for actions
    const result = await db.async_query({
      query: "SELECT action FROM account_creation_actions",
      where: {
        "email_address  = $::TEXT": opts.email_address,
        "expire        >= $::TIMESTAMP": new Date(),
      },
    });

    return (result.rows ?? []).map((row) => row.action);
  }
}

/**
 * Mark account creation actions as successfully completed.
 * Sets the `creation_actions_done` flag to true for the account.
 */
export async function accountCreationActionsSuccess(
  db: PostgreSQL,
  opts: AccountCreationActionsSuccessOptions,
): Promise<void> {
  await db.async_query({
    query: "UPDATE accounts",
    set: {
      "creation_actions_done::BOOLEAN": true,
    },
    where: {
      "account_id = $::UUID": opts.account_id,
    },
  });
}

/**
 * Execute all pending account creation actions for an email address.
 *
 * DEPRECATED: Use import accountCreationActions from "@cocalc/server/accounts/account-creation-actions"; instead!
 *
 * This function:
 * 1. Retrieves all pending actions for the email
 * 2. Executes each action (currently only supports 'add_to_project')
 * 3. Marks the account creation actions as done
 *
 * Note: This implementation may miss important actions like creating initial project.
 * The TypeScript replacement in @cocalc/server/accounts/account-creation-actions is preferred.
 */
export async function doAccountCreationActions(
  db: PostgreSQL,
  opts: DoAccountCreationActionsOptions,
): Promise<void> {
  const dbg = db._dbg(
    `doAccountCreationActions(email_address='${opts.email_address}')`,
  );
  dbg(
    "**DEPRECATED!**  This will miss doing important things, e.g., creating initial project.",
  );

  // Get all actions for this email
  const actions = await accountCreationActions(db, {
    email_address: opts.email_address,
  });

  if (!actions || actions.length === 0) {
    // No actions to execute, but still mark as done
    await accountCreationActionsSuccess(db, {
      account_id: opts.account_id,
    });
    return;
  }

  // Execute each action
  const errors: string[] = [];

  for (const action of actions) {
    dbg(`account_creation_actions: action = ${to_json(action)}`);

    if (action.action === "add_to_project") {
      try {
        await new Promise<void>((resolve, reject) => {
          db.add_user_to_project({
            project_id: action.project_id,
            account_id: opts.account_id,
            group: action.group,
            cb: (err) => {
              if (err) {
                dbg(`Error adding user to project: ${err}`);
                reject(err);
              } else {
                resolve();
              }
            },
          });
        });
      } catch (err) {
        errors.push(String(err));
      }
    } else {
      dbg(`ERROR: skipping unknown action -- ${action.action}`);
      // Store in database so we can look into this later
      await new Promise<void>((resolve) => {
        db.log({
          event: "unknown_action",
          value: {
            error: "unknown_action",
            action,
            account_id: opts.account_id,
            host: require("os").hostname(),
          },
          cb: () => resolve(), // Ignore errors in logging
        });
      });
    }
  }

  // Mark as done even if there were errors
  await accountCreationActionsSuccess(db, {
    account_id: opts.account_id,
  });

  // If there were any errors, throw the first one
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
}
