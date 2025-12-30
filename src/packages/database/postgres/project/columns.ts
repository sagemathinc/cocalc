/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Project column constants used for database queries
 */

export const PUBLIC_PROJECT_COLUMNS = [
  "project_id",
  "last_edited",
  "title",
  "description",
  "deleted",
  "created",
  "env",
] as const;

export const PROJECT_COLUMNS = ["users", ...PUBLIC_PROJECT_COLUMNS] as const;
