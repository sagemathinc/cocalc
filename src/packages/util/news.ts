/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { NewsItem } from "./types/news";

// Slug URL, based on the title and with "-[id]" at the end.
// https://www.semrush.com/blog/what-is-a-url-slug/
// The main point here is to have a URL that contains unique information and is human readable.
export function slugURL(news?: Pick<NewsItem, "id" | "title">): string {
  if (!news || !news.title || !news.id) return "/news";
  const { title, id } = news;
  const shortTitle = title
    .toLowerCase()
    // limit the max length, too long URLs are bad as well
    .slice(0, 200)
    // replace all non-alphanumeric characters with a space
    .replace(/[^a-zA-Z0-9]/g, " ")
    // replace multiple spaces with a single dash
    .replace(/\s+/g, "-");
  return `/news/${shortTitle}-${id}`;
}
