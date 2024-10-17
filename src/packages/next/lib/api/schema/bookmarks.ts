/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { z } from "../framework";

import {
  LoadStarredFilesBookmarksProps,
  SaveStarredFilesBoookmarksProps,
} from "@cocalc/server/bookmarks/starred";
import { STARRED } from "@cocalc/util/consts/bookmarks";
import { GetStarredBookmarks } from "@cocalc/util/types/bookmarks";
import { ProjectIdSchema } from "./projects/common";

const ERROR = z.object({
  status: z.literal("error"),
  error: z.string(),
});

const COMMON_STARRED = z.object({
  project_id: ProjectIdSchema,
  type: z.literal(STARRED),
});

export const BookmarkSetInputSchema = COMMON_STARRED.extend({
  payload: z.string().array(),
});

export const BookmarkSetOutputSchema = z.union([
  COMMON_STARRED.merge(z.object({ status: z.literal("success") })),
  ERROR,
]);

export const BookmarkAddInputSchema = BookmarkSetInputSchema;
export const BookmarkAddOutputSchema = BookmarkSetOutputSchema;

export const BookmarkRemoveInputSchema = BookmarkSetInputSchema;
export const BookmarkRemoveOutputSchema = BookmarkSetOutputSchema;

export const BookmarkGetInputSchema = COMMON_STARRED;
export const BookmarkGetOutputSchema = z.union([
  z
    .object({
      status: z.literal("success"),
      payload: z
        .array(z.string())
        .describe(
          "Array of file path strings, as they are in the starred tabs flyout",
        ),
      last_edited: z
        .number()
        .optional()
        .describe("UNIX epoch timestamp, when bookmark was last edited"),
    })
    .merge(COMMON_STARRED),
  ERROR.merge(COMMON_STARRED),
]);

export type BookmarkSetInputType = z.infer<typeof BookmarkSetInputSchema>;
export type BookmarkSetOutputType = z.infer<typeof BookmarkSetOutputSchema>;
export type BookmarkAddInputType = z.infer<typeof BookmarkAddInputSchema>;
export type BookmarkAddOutputType = z.infer<typeof BookmarkRemoveOutputSchema>;
export type BookmarkRemoveInputType = z.infer<typeof BookmarkRemoveInputSchema>;
export type BookmarkRemoveOutputType = z.infer<typeof BookmarkAddOutputSchema>;
export type BookmarkGetInputType = z.infer<typeof BookmarkGetInputSchema>;
export type BookmarkGetOutputType = z.infer<typeof BookmarkGetOutputSchema>;

// consistency checks
export const _1: Omit<SaveStarredFilesBoookmarksProps, "mode" | "account_id"> =
  {} as Omit<BookmarkSetInputType, typeof STARRED>;

export const _2: Omit<LoadStarredFilesBookmarksProps, "account_id"> =
  {} as Omit<BookmarkGetInputType, typeof STARRED>;

export const _3: BookmarkGetOutputType = {} as GetStarredBookmarks;
