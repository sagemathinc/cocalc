/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";

import { conat } from "@cocalc/backend/conat/conat";
import { dkv } from "@cocalc/backend/conat/sync";
import {
  CONAT_BOOKMARKS_KEY,
  STARRED_FILES,
} from "@cocalc/util/consts/bookmarks";
import { getLogger } from "./logger";
import getPool from "@cocalc/database/pool";

const L = getLogger("hub:migrate-bookmarks");

const BATCH_SIZE = 100;
const MIGRATION_DELAY = 500; // ms between batches to avoid database saturation

export async function migrateBookmarksToConat(): Promise<void> {
  L.info("Starting migration of bookmarks to conat...");

  const pool = getPool();
  let totalMigrated = 0;
  let batchCount = 0;

  while (true) {
    try {
      // Query for a batch of bookmark entries
      const { rows } = await pool.query(
        `
          SELECT id, account_id, project_id, stars
          FROM bookmarks
          WHERE type = $1
          ORDER BY id
          LIMIT $2
        `,
        [STARRED_FILES, BATCH_SIZE],
      );

      if (rows.length === 0) {
        L.info(
          `Migration completed. Total migrated: ${totalMigrated} bookmarks`,
        );
        break;
      }

      batchCount++;
      L.info(`Processing batch ${batchCount} with ${rows.length} bookmarks...`);

      // Process each bookmark in the batch
      const processedIds: string[] = [];

      for (const row of rows) {
        try {
          const { id, account_id, project_id, stars } = row;

          if (!account_id || !project_id || !Array.isArray(stars)) {
            L.warn(
              `Skipping invalid bookmark ${id}: account_id=${account_id}, project_id=${project_id}, stars=${stars}`,
            );
            processedIds.push(id);
            continue;
          }

          // Get or create conat DKV for this account
          const bookmarks = await dkv<string[]>({
            name: CONAT_BOOKMARKS_KEY,
            account_id,
            client: conat(),
          });

          // Set the starred files for this project
          bookmarks.set(project_id, stars);
          L.debug(
            `Migrated bookmark ${id} for account ${account_id}, project ${project_id} with ${stars.length} stars`,
          );

          processedIds.push(id);
          totalMigrated++;
        } catch (err) {
          L.error(`Failed to migrate bookmark ${row.id}: ${err}`);
          // Still add to processedIds so we don't get stuck on this one
          processedIds.push(row.id);
        }
      }

      // Delete the processed bookmarks from the database
      if (processedIds.length > 0) {
        await pool.query(`DELETE FROM bookmarks WHERE id = ANY($1)`, [
          processedIds,
        ]);
        L.debug(`Deleted ${processedIds.length} bookmarks from database`);
      }

      // Wait between batches to avoid database saturation
      if (rows.length === BATCH_SIZE) {
        L.debug(`Waiting ${MIGRATION_DELAY}ms before next batch...`);
        await delay(MIGRATION_DELAY);
      }
    } catch (err) {
      L.error(`Error in migration batch: ${err}`);
      // Wait longer on error before retrying
      await delay(MIGRATION_DELAY * 3);
    }
  }

  L.info("Bookmark migration to conat completed successfully");
}
