/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { z } from "../framework";

import { STARRED } from "@cocalc/util/consts/bookmarks";
import { ProjectIdSchema } from "./projects/common";

const ERROR = z.object({
  status: z.literal("error"),
  error: z.string().optional(),
});

const COMMON_STARRED = z.object({
  project_id: ProjectIdSchema,
  type: z.literal(STARRED),
});

export const BookmarkSetSchema = COMMON_STARRED.extend({
  payload: z.array(z.string()),
});

export const BookmarkSetOutputSchema = z.union([
  z.object({ status: z.literal("success") }),
  ERROR,
]);

export const BookmarkGetSchema = COMMON_STARRED;

export const BookmarkGetOutputSchema = z.union([
  z.object({
    status: z.literal("success"),
    project_id: ProjectIdSchema,
    type: z.literal(STARRED),
    payload: z
      .array(z.string())
      .describe(
        "Array of file path strings, as they are in the starred tabs flyout",
      ),
    last_edited: z
      .number()
      .describe("UNIX epoch timestamp, when bookmark was last edited"),
  }),
  ERROR.merge(COMMON_STARRED),
]);

export type BookmarkSetType = z.infer<typeof BookmarkSetSchema>;
export type BookmarkSetOutputType = z.infer<typeof BookmarkSetOutputSchema>;
export type BookmarkGetType = z.infer<typeof BookmarkGetOutputSchema>;
export type BookmarkGetOutputType = z.infer<typeof BookmarkGetOutputSchema>;
