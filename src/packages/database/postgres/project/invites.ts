/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../types";

interface WhenSentProjectInviteOptions {
  project_id: string;
  to: string; // email address
}

interface SentProjectInviteOptions {
  project_id: string;
  to: string; // email address
  error?: string; // if there was an error, set it to this; leave undefined to mean sending succeeded
}

/**
 * Check if an invite has been successfully sent to a given email address for a project.
 *
 * Returns:
 * - Date object with the timestamp when the invite was sent (if sent successfully)
 * - 0 if no invite was sent, or if the invite had an error, or if no time was recorded
 */
export async function whenSentProjectInvite(
  db: PostgreSQL,
  opts: WhenSentProjectInviteOptions,
): Promise<Date | number> {
  const valid = db._validate_opts(opts);
  if (!valid) {
    throw new Error("Invalid options");
  }

  // Sanitize email address for JSONB path query
  // This handles special characters in emails like quotes
  const sani_to = db.sanitize(`{"${opts.to}"}`);

  // Query the invite JSONB field for this specific email
  const query_select = `SELECT invite#>${sani_to} AS to FROM projects`;

  const result = await db.async_query({
    query: query_select,
    where: { "project_id :: UUID = $": opts.project_id },
  });

  // Process result using one_result pattern
  if (!result.rows || result.rows.length === 0) {
    return 0;
  }

  const y = result.rows[0]?.to;

  // Return 0 if: no result, or error exists, or no time recorded
  if (!y || y.error || !y.time) {
    return 0;
  }

  // Return the timestamp as a Date object
  return new Date(y.time);
}

/**
 * Record that an email invite has been sent (or attempted) for a project.
 *
 * This updates the projects.invite JSONB field to track:
 * - time: when the invite was sent
 * - error: any error that occurred (undefined if successful)
 *
 * Multiple invites for different emails are tracked in the same JSONB field.
 */
export async function sentProjectInvite(
  db: PostgreSQL,
  opts: SentProjectInviteOptions,
): Promise<void> {
  await db.async_query({
    query: "UPDATE projects",
    jsonb_merge: {
      invite: {
        [opts.to]: {
          time: new Date(),
          error: opts.error,
        },
      },
    },
    where: { "project_id :: UUID = $": opts.project_id },
  });
}
