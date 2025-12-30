/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Channel,
  EVENT_CHANNEL,
  NewsItem,
  NewsPrevNext,
  RecentHeadline,
} from "@cocalc/util/types/news";
import { LRUQueryCache } from "./utils/query-cache";

const C = new LRUQueryCache({ ttl_s: 10 * 60 });

export function clearCache(): void {
  C.clear();
}

// We exclude hidden and future news items and items from the events channel to keep user's news
// feed clear
const Q_FEED = `
SELECT
  id, channel, title, text, url,
  extract(epoch from date::timestamp)::integer as date,
  extract(epoch from until::timestamp)::integer as until
FROM news
WHERE news.date <= NOW()
  AND hide IS NOT TRUE
  AND channel != '${EVENT_CHANNEL}'
  AND (until IS NULL OR until > NOW())
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
  extract(epoch from date::timestamptz)::INTEGER as date,
  extract(epoch from until::timestamptz)::INTEGER as until
FROM news
WHERE id = $1`;

// This is used for editing a news item
export async function getNewsItem(
  id: number,
  cached = true,
): Promise<NewsItem | null> {
  return await C.queryOne<NewsItem>(Q_BY_ID, [id], cached);
}

const Q_BY_ID_USER = `
SELECT
  id, channel, title, text, url, hide, tags, history,
  date >= NOW() as future,
  until IS NOT NULL AND until <= NOW() as expired,
  extract(epoch from date::timestamptz)::INTEGER as date,
  extract(epoch from until::timestamptz)::INTEGER as until
FROM news
WHERE id = $1`;

const Q_NEXT = `
SELECT id, title
FROM news
WHERE date >= (SELECT date FROM news WHERE id = $1)
  AND id != $1
  AND hide IS NOT TRUE
  AND date < NOW()
  AND channel != '${EVENT_CHANNEL}'
  AND (until IS NULL OR until > NOW())
ORDER BY date ASC, id ASC
LIMIT 1`;

const Q_PREV = `
SELECT id, title
FROM news
WHERE date <= (SELECT date FROM news WHERE id = $1)
  AND id != $1
  AND hide IS NOT TRUE
  AND date < NOW()
  AND channel != '${EVENT_CHANNEL}'
  AND (until IS NULL OR until > NOW())
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
  until IS NOT NULL AND until <= NOW() as expired,
  extract(epoch from date::timestamptz)::INTEGER as date,
  extract(epoch from until::timestamptz)::INTEGER as until
FROM news
    WHERE channel <> '${EVENT_CHANNEL}'
ORDER BY date DESC
LIMIT $1
OFFSET $2`;

export async function getIndex(
  limit: number,
  offset: number,
): Promise<NewsItem[]> {
  return await C.query<NewsItem>(Q_INDEX, [limit, offset]);
}

// get the most recent news item (excluding events)
const Q_MOST_RECENT = `
SELECT
  id, channel, title, tags,
  extract(epoch from date::timestamptz)::INTEGER as date,
  extract(epoch from until::timestamptz)::INTEGER as until
FROM news
WHERE date <= NOW()
  AND hide IS NOT TRUE
  AND channel != '${EVENT_CHANNEL}'
  AND (until IS NULL OR until > NOW())
ORDER BY date DESC
LIMIT 1`;

export async function getMostRecentNews(): Promise<RecentHeadline | null> {
  return await C.queryOne<RecentHeadline>(Q_MOST_RECENT);
}

const Q_RECENT = `
SELECT
  id, channel, title, tags,
  extract(epoch from date::timestamptz)::INTEGER as date,
  extract(epoch from until::timestamptz)::INTEGER as until
FROM news
WHERE date <= NOW()
  AND channel != '${EVENT_CHANNEL}'
  AND hide IS NOT TRUE
  AND (until IS NULL OR until > NOW())
ORDER BY date DESC
LIMIT $1`;

// of the last n picked by Q_RECENT, select one deterministically different every 10 minutes
export async function getRecentHeadlines(
  n: number,
): Promise<RecentHeadline[] | null> {
  const headlines = await C.query<RecentHeadline>(Q_RECENT, [n]);
  if (headlines.length === 0) return null;
  return headlines;
}

// Query upcoming events from a particular channel
const Q_UPCOMING_NEWS_CHANNEL_ITEMS = `
SELECT
  id, channel, title, text, url, tags,
  extract(epoch from date::timestamp)::integer as date,
  extract(epoch from until::timestamp)::integer as until
FROM news
WHERE date >= NOW()
  AND channel = $1
  AND hide IS NOT TRUE
  AND (until IS NULL OR until > NOW())
ORDER BY date
LIMIT 100`;

export async function getUpcomingNewsChannelItems(
  channel: Channel,
): Promise<NewsItem[]> {
  return await C.query<NewsItem>(Q_UPCOMING_NEWS_CHANNEL_ITEMS, [channel]);
}

// Query past events from a particular channel
const Q_PAST_NEWS_CHANNEL_ITEMS = `
SELECT
  id, channel, title, text, url, tags,
  extract(epoch from date::timestamp)::integer as date,
  extract(epoch from until::timestamp)::integer as until
FROM news
WHERE date <= NOW()
  AND channel = $1
  AND hide IS NOT TRUE
  AND (until IS NULL OR until > NOW())
ORDER BY date DESC
LIMIT 100`;

export async function getPastNewsChannelItems(
  channel: Channel,
): Promise<NewsItem[]> {
  return await C.query<NewsItem>(Q_PAST_NEWS_CHANNEL_ITEMS, [channel]);
}
