/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { available_upgrades } from "@cocalc/util/upgrades";
import { quota } from "@cocalc/util/upgrades/quota";
import {
  is_array,
  is_valid_uuid_string,
  keys,
  map_sum,
} from "@cocalc/util/misc";
import type { PostgreSQL } from "../types";

interface GetProjectQuotasOptions {
  project_id: string;
}

interface GetUserProjectUpgradesOptions {
  account_id: string;
}

interface EnsureUserProjectUpgradesAreValidOptions {
  account_id: string;
  fix?: boolean; // default: true
}

interface EnsureAllUserProjectUpgradesAreValidOptions {
  limit?: number; // default: 1
}

interface GetProjectUpgradesOptions {
  project_id: string;
}

interface RemoveAllUserProjectUpgradesOptions {
  account_id: string;
  projects?: string[];
}

/**
 * Get project quotas by combining settings, users, site licenses, and server settings.
 */
export async function getProjectQuotas(
  db: PostgreSQL,
  opts: GetProjectQuotasOptions,
): Promise<any> {
  const valid = db._validate_opts(opts);
  if (!valid) {
    throw new Error("Invalid options");
  }

  // Fetch project data and server settings in parallel
  const [projectResult, serverSettings] = await Promise.all([
    db.async_query({
      query: "SELECT settings, users, site_license FROM projects",
      where: { "project_id = $::UUID": opts.project_id },
    }),
    new Promise<any>((resolve, reject) => {
      db.get_server_settings_cached({
        cb: (err, settings) => {
          if (err) reject(err);
          else resolve(settings);
        },
      });
    }),
  ]);

  if (!projectResult.rows || projectResult.rows.length === 0) {
    throw new Error("project not found");
  }

  const { settings, users, site_license } = projectResult.rows[0];

  // Calculate quotas using the quota function
  const upgrades = quota(settings, users, site_license, serverSettings);

  return upgrades;
}

/**
 * Return mapping from project_id to map listing the upgrades this particular user
 * applied to the given project. This only includes project_id's of projects that
 * this user may have upgraded in some way.
 *
 * NOTE: If a project has `upgrades: null`, it's included in the result with null value.
 * This matches CoffeeScript behavior.
 */
export async function getUserProjectUpgrades(
  db: PostgreSQL,
  opts: GetUserProjectUpgradesOptions,
): Promise<Record<string, any>> {
  const valid = db._validate_opts(opts);
  if (!valid) {
    throw new Error("Invalid options");
  }

  // Use sanitize to safely inject account_id into JSONB path
  const sani_account_id = db.sanitize(`{${opts.account_id},upgrades}`);

  const result = await db.async_query({
    query: `SELECT project_id, users#>${sani_account_id} AS upgrades FROM projects`,
    where: [
      { "users ? $::TEXT": opts.account_id }, // this is a user of the project
      `users#>${sani_account_id} IS NOT NULL`, // upgrades are defined (but can be null)
    ],
  });

  const upgrades: Record<string, any> = {};
  for (const row of result.rows ?? []) {
    upgrades[row.project_id] = row.upgrades;
  }

  return upgrades;
}

/**
 * Ensure that all upgrades applied by the given user to projects are consistent,
 * truncating any that exceed their allotment. NOTE: Unless there is a bug,
 * the only way the quotas should ever exceed their allotment would be if the
 * user is trying to cheat... *OR* a subscription was canceled or ended.
 *
 * @param opts.fix - if true (default), will fix projects in database whose quotas exceed the allotted amount
 * @returns excess - object mapping project_id to excess upgrades
 */
export async function ensureUserProjectUpgradesAreValid(
  db: PostgreSQL,
  opts: EnsureUserProjectUpgradesAreValidOptions,
): Promise<Record<string, any>> {
  const fix = opts.fix ?? true;
  const dbg = db._dbg(
    `ensureUserProjectUpgradesAreValid(account_id='${opts.account_id}')`,
  );
  dbg();

  // Fetch stripe data and project upgrades in parallel
  const [stripeResult, projectUpgrades] = await Promise.all([
    db.async_query({
      query: "SELECT stripe_customer FROM accounts",
      where: { "account_id = $::UUID": opts.account_id },
    }),
    getUserProjectUpgrades(db, { account_id: opts.account_id }),
  ]);

  const stripeCustomer = stripeResult.rows?.[0]?.stripe_customer;
  const stripeData = stripeCustomer?.subscriptions?.data;

  // Calculate excess upgrades
  const { excess } = available_upgrades(stripeData, projectUpgrades);

  // Fix projects if requested
  if (fix && excess && Object.keys(excess).length > 0) {
    const fixProject = async (project_id: string): Promise<void> => {
      dbg(
        `fixing project_id='${project_id}' with excess ${JSON.stringify(excess[project_id])}`,
      );

      // Fetch current upgrades for this user in this project
      const sani_account_id = db.sanitize(`{${opts.account_id},upgrades}`);
      const result = await db.async_query({
        query: `SELECT users#>${sani_account_id} AS upgrades FROM projects`,
        where: { "project_id = $::UUID": project_id },
      });

      const upgrades = result.rows?.[0]?.upgrades;
      if (!upgrades) {
        return;
      }

      // Subtract excess from upgrades
      for (const [key, value] of Object.entries(excess[project_id])) {
        upgrades[key] = (upgrades[key] ?? 0) - (value as number);
      }

      // Update the project with corrected upgrades
      await db.async_query({
        query: "UPDATE projects",
        where: { "project_id = $::UUID": project_id },
        jsonb_merge: {
          users: {
            [opts.account_id]: { upgrades },
          },
        },
      });
    };

    // Fix all projects with excess sequentially (to match CoffeeScript behavior)
    const projectIds = keys(excess);
    for (const project_id of projectIds) {
      await fixProject(project_id);
    }
  }

  return excess;
}

/**
 * Loop through every user of cocalc that is connected with stripe (so may have a subscription),
 * and ensure that any upgrades that have applied to projects are valid. It is important to
 * run this periodically or there is a really natural common case where users can cheat:
 *    (1) they apply upgrades to a project
 *    (2) their subscription expires
 *    (3) they do NOT touch upgrades on any projects again.
 *
 * @param opts.limit - Number of accounts to process in parallel (default: 1)
 */
export async function ensureAllUserProjectUpgradesAreValid(
  db: PostgreSQL,
  opts: EnsureAllUserProjectUpgradesAreValidOptions = {},
): Promise<void> {
  const limit = opts.limit ?? 1;
  const dbg = db._dbg("ensureAllUserProjectUpgradesAreValid");

  // Get all account IDs with Stripe customer IDs
  const result = await db.async_query({
    query: "SELECT account_id FROM accounts",
    where: "stripe_customer_id IS NOT NULL",
    timeout_s: 300,
  });

  const accountIds = (result.rows ?? []).map((row) => row.account_id);
  const n = accountIds.length;
  dbg(`got ${n} accounts with stripe`);

  // Process accounts with concurrency limit
  let m = 0;
  const processAccount = async (account_id: string): Promise<void> => {
    m += 1;
    dbg(`${m}/${n}`);
    await ensureUserProjectUpgradesAreValid(db, { account_id });
  };

  // Process in batches based on limit
  for (let i = 0; i < accountIds.length; i += limit) {
    const batch = accountIds.slice(i, i + limit);
    await Promise.all(batch.map(processAccount));
  }
}

/**
 * Return the sum total of all user upgrades to a particular project.
 *
 * NOTE: Returns {} (empty object) when no upgrades exist, NOT undefined.
 * This matches CoffeeScript behavior.
 */
export async function getProjectUpgrades(
  db: PostgreSQL,
  opts: GetProjectUpgradesOptions,
): Promise<any> {
  const valid = db._validate_opts(opts);
  if (!valid) {
    throw new Error("Invalid options");
  }

  const result = await db.async_query({
    query: "SELECT users FROM projects",
    where: { "project_id = $::UUID": opts.project_id },
  });

  const users = result.rows?.[0]?.users;

  // Initialize as undefined to match CoffeeScript behavior
  let upgrades: any = undefined;
  if (users) {
    for (const [, info] of Object.entries(users)) {
      upgrades = map_sum(upgrades, (info as any).upgrades);
    }
  }

  // CoffeeScript returns {} when map_sum returns undefined (no upgrades found)
  // but returns undefined when users is null/undefined
  return upgrades;
}

/**
 * Remove all upgrades to all projects applied by this particular user.
 *
 * @param opts.projects - if given, only remove from projects with id in this array
 *
 * NOTE: Empty projects array causes SQL syntax error (known limitation from CoffeeScript)
 */
export async function removeAllUserProjectUpgrades(
  db: PostgreSQL,
  opts: RemoveAllUserProjectUpgradesOptions,
): Promise<void> {
  if (!is_valid_uuid_string(opts.account_id)) {
    throw new Error("invalid account_id");
  }

  // Build query string with direct interpolation (matches CoffeeScript)
  const query = `UPDATE projects SET users=jsonb_set(users, '{${opts.account_id}}', jsonb(users#>'{${opts.account_id}}') - 'upgrades')`;

  const where: any[] = [
    { "users ? $::TEXT": opts.account_id }, // this is a user of the project
    `users#>'{${opts.account_id},upgrades}' IS NOT NULL`, // upgrades are defined
  ];

  if (opts.projects) {
    if (!is_array(opts.projects)) {
      throw new Error("projects must be an array");
    }

    const projectIds: string[] = [];
    for (const project_id of opts.projects) {
      if (!is_valid_uuid_string(project_id)) {
        throw new Error("each entry in projects must be a valid uuid");
      }
      projectIds.push(`'${project_id}'`);
    }

    // NOTE: This will cause SQL syntax error if projectIds is empty: "in ()"
    // This matches CoffeeScript behavior (known limitation)
    where.push(`project_id in (${projectIds.join(",")})`);
  }

  await db.async_query({
    query,
    where,
  });
}
