/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";

import { TypedMap } from "@cocalc/frontend/app-framework";
import { CHANNELS, NewsItemWebapp } from "@cocalc/util/types/news";

export const NEWS_CHANNELS = [
  "allNews",
  ...CHANNELS.filter((c) => c !== "event"),
] as const;

export type NewsFilter = typeof NEWS_CHANNELS[number];

// function, that checks if given string is of type NewsFilter
export function isNewsFilter(ch: string): ch is NewsFilter {
  return NEWS_CHANNELS.includes(ch as any);
}

export type NewsMap = Map<string, NewsInfo>;

export type NewsInfo = TypedMap<NewsItemWebapp>;
