/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { NewsType } from "./types/news";

// slug URL, based on the title and with "-[id]" at the end
// https://www.semrush.com/blog/what-is-a-url-slug/
export function slugURL(news: NewsType): string {
  const shortTitle = news.title
    .toLowerCase()
    .slice(0, 200)
    .replace(/[^a-zA-Z0-9]/g, "-");
  return `/news/${shortTitle}-${news.id}`;
}
