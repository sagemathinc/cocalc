/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { NewsItem, NewsPrevNext } from "@cocalc/util/types/news";
import { LRUQueryCache } from "./util";

const C = new LRUQueryCache({ ttl_s: 10 * 60 });

export function clearCache(): void {
  C.clear();
}

// we exclude hidden and future news items
const Q_FEED = `
SELECT
  id, channel, title, text, url,
  extract(epoch from date::timestamp)::integer as date
FROM news
WHERE news.date <= NOW()
  AND hide IS NOT TRUE
ORDER BY date DESC
LIMIT 100`;

export async function getFeedData(): Promise<NewsItem[]> {
  return await C.query<NewsItem>(Q_FEED);
}

// ::timestamptz because if your server is not in UTC, it will be converted to UTC
// and the UTC epoch timestamp will be used in the browser client as the basis, adding your TZ offset
const Q_BY_ID = `
SELECT
  id, channel, title, text, url, hide, tags,
  extract(epoch from date::timestamptz)::INTEGER as date
FROM news
WHERE id = $1`;

// This is used for editing a news item
export async function getNewsItem(id: number): Promise<NewsItem | null> {
  return await C.queryOne<NewsItem>(Q_BY_ID, [id]);
}

const Q_BY_ID_USER = `
SELECT
  id, channel, title, text, url, hide, tags, history,
  date >= NOW() as future,
  extract(epoch from date::timestamptz)::INTEGER as date
FROM news
WHERE id = $1`;

const Q_NEXT = `
SELECT id, title
FROM news
WHERE date >= (SELECT date FROM news WHERE id = $1)
  AND id != $1
  AND hide IS NOT TRUE
  AND date < NOW()
ORDER BY date ASC, id ASC
LIMIT 1`;

const Q_PREV = `
SELECT id, title
FROM news
WHERE date <= (SELECT date FROM news WHERE id = $1)
  AND id != $1
  AND hide IS NOT TRUE
  AND date < NOW()
ORDER BY date DESC, id DESC
LIMIT 1`;

// This is used for displaying one news item (and next/prev ones) to a user
export async function getNewsItemUserPrevNext(id: number): Promise<{
  news: NewsItem | null;
  prev: NewsPrevNext | null;
  next: NewsPrevNext | null;
}> {
  const [news, prev, next] = await Promise.all([
    C.queryOne<NewsItem>(Q_BY_ID_USER, [id]),
    C.queryOne<NewsPrevNext>(Q_PREV, [id]),
    C.queryOne<NewsPrevNext>(Q_NEXT, [id]),
  ]);
  return { news, prev, next };
}

export async function getNewsItemUser(id: number): Promise<NewsItem | null> {
  return await C.queryOne<NewsItem>(Q_BY_ID_USER, [id]);
}

const Q_INDEX = `
SELECT
  id, channel, title, text, url, hide, tags,
  date >= NOW() as future,
  extract(epoch from date::timestamptz)::INTEGER as date
FROM news
ORDER BY date DESC
LIMIT $1
OFFSET $2`;

export async function getIndex(
  limit: number,
  offset: number
): Promise<NewsItem[]> {
  return await C.query<NewsItem>(Q_INDEX, [limit, offset]);
}
