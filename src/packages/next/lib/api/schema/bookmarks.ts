/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { z } from "../framework";

import {
  LoadStarredFilesBookmarksProps,
  SaveStarredFilesBoookmarksProps,
} from "@cocalc/server/bookmarks/starred";
import { MAX_STARS, STARRED_FILES } from "@cocalc/util/consts/bookmarks";
import {
  GetStarredBookmarks,
  GetStarredBookmarksPayload,
  SetStarredBookmarks,
} from "@cocalc/util/types/bookmarks";
import { ProjectIdSchema } from "./projects/common";

const ERROR = z.object({
  status: z.literal("error"),
  error: z.string(),
});

const STARRED = z.object({ type: z.literal(STARRED_FILES) });

const COMMON_STARS = STARRED.merge(z.object({ project_id: ProjectIdSchema }));

export const BookmarkSetInputSchema = COMMON_STARS.extend({
  stars: z
    .string()
    .array()
    .max(MAX_STARS)
    .describe("List of file paths or IDs"),
}).describe("Set the list of starred items to the given list of stars.");

export const BookmarkSetOutputSchema = z.union([
  COMMON_STARS.merge(z.object({ status: z.literal("success") })),
  ERROR,
]);

export const BookmarkAddInputSchema = BookmarkSetInputSchema.describe(
  "Add a list of starred items to the list of bookmarks.",
);
export const BookmarkAddOutputSchema = BookmarkSetOutputSchema;

export const BookmarkRemoveInputSchema = BookmarkSetInputSchema.describe(
  "Remove a list of starred items from the given list of bookmarks.",
);
export const BookmarkRemoveOutputSchema = BookmarkSetOutputSchema;

export const BookmarkGetInputSchema = COMMON_STARS.describe(
  "Get the list of starred items for the given project ID and your account.",
);

const OUTPUT_COMMON = z.object({
  status: z.literal("success"),
  stars: z
    .array(z.string())
    .describe(
      "Array of IDs or file path strings, as they are in the starred tabs flyout",
    ),
  last_edited: z
    .number()
    .optional()
    .describe("UNIX epoch timestamp, when bookmark was last edited"),
});

export const BookmarkGetOutputSchema = z.union([
  OUTPUT_COMMON.merge(COMMON_STARS),
  ERROR.merge(COMMON_STARS),
]);

export const BookmarkAllInputSchema = STARRED;
export const BookmarkAllOutputSchema = z.union([
  OUTPUT_COMMON.merge(STARRED),
  ERROR.merge(STARRED),
]);

export type BookmarkSetInputType = z.infer<typeof BookmarkSetInputSchema>;
export type BookmarkSetOutputType = z.infer<typeof BookmarkSetOutputSchema>;
export type BookmarkAddInputType = z.infer<typeof BookmarkAddInputSchema>;
export type BookmarkAddOutputType = z.infer<typeof BookmarkRemoveOutputSchema>;
export type BookmarkRemoveInputType = z.infer<typeof BookmarkRemoveInputSchema>;
export type BookmarkRemoveOutputType = z.infer<typeof BookmarkAddOutputSchema>;
export type BookmarkGetInputType = z.infer<typeof BookmarkGetInputSchema>;
export type BookmarkGetOutputType = z.infer<typeof BookmarkGetOutputSchema>;
export type BookmarkAllInputType = z.infer<typeof BookmarkAllInputSchema>;
export type BookmarkAllOutputType = z.infer<typeof BookmarkAllOutputSchema>;

// consistency checks
export const _1: Omit<SaveStarredFilesBoookmarksProps, "mode" | "account_id"> =
  {} as Omit<BookmarkSetInputType, typeof STARRED_FILES>;

export const _2: Omit<LoadStarredFilesBookmarksProps, "account_id"> =
  {} as Omit<BookmarkGetInputType, typeof STARRED_FILES>;

export const _3: BookmarkGetOutputType = {} as GetStarredBookmarks;

export const _4: BookmarkSetInputType = {} as SetStarredBookmarks;

export const _5: BookmarkGetInputType = {} as GetStarredBookmarksPayload;
