/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";
import {
  EVENT_CHANNEL,
  type Channel,
  type NewsItem,
} from "@cocalc/util/types/news";

import {
  clearCache,
  getFeedData,
  getIndex,
  getMostRecentNews,
  getNewsItem,
  getNewsItemUser,
  getNewsItemUserPrevNext,
  getPastNewsChannelItems,
  getRecentHeadlines,
  getUpcomingNewsChannelItems,
} from "./news";

type NewsHistoryEntry = {
  channel: Channel;
  date: Date;
  title: string;
  text: string;
  tags?: string[];
  url?: string;
  until?: Date | null;
};

type NewsHistory = Record<number, NewsHistoryEntry>;

interface SeedNewsItem {
  id: number;
  channel: Channel;
  title: string;
  text: string;
  date: Date;
  tags?: string[];
  url?: string;
  hide?: boolean;
  until?: Date | null;
  history?: NewsHistory;
}

type NewsItemWithStatus = NewsItem & {
  future: boolean;
  expired: boolean;
};

const now = new Date();
const dayMs = 24 * 60 * 60 * 1000;

const newsIds = {
  oldFeature: 1,
  announcement: 2,
  platformUpdate: 3,
  hiddenAbout: 4,
  pastEvent: 5,
  expiredFeature: 6,
  recentFeature: 7,
  futureFeature: 8,
  upcomingEvent: 9,
  latestAnnouncement: 10,
} as const;

const historyTimestamp = Math.floor((now.getTime() - 12 * dayMs) / 1000);

const seedNewsItems: SeedNewsItem[] = [
  {
    id: newsIds.oldFeature,
    channel: "feature",
    title: "Old Feature",
    text: "Details about an older feature.",
    date: new Date(now.getTime() - 90 * dayMs),
    tags: ["feature"],
  },
  {
    id: newsIds.announcement,
    channel: "announcement",
    title: "Mid Announcement",
    text: "Announcement text.",
    date: new Date(now.getTime() - 30 * dayMs),
    tags: ["announcement"],
  },
  {
    id: newsIds.platformUpdate,
    channel: "platform",
    title: "Platform Update",
    text: "Platform update details.",
    date: new Date(now.getTime() - 15 * dayMs),
    until: new Date(now.getTime() + 15 * dayMs),
    tags: ["platform"],
  },
  {
    id: newsIds.hiddenAbout,
    channel: "about",
    title: "Hidden About",
    text: "Hidden item.",
    date: new Date(now.getTime() - 10 * dayMs),
    hide: true,
    tags: ["about"],
  },
  {
    id: newsIds.pastEvent,
    channel: EVENT_CHANNEL,
    title: "Past Event",
    text: "Past event details.",
    date: new Date(now.getTime() - 8 * dayMs),
    tags: ["event"],
    url: "https://example.com/past-event",
  },
  {
    id: newsIds.expiredFeature,
    channel: "feature",
    title: "Expired Feature",
    text: "Expired news item.",
    date: new Date(now.getTime() - 6 * dayMs),
    until: new Date(now.getTime() - 1 * dayMs),
    tags: ["feature"],
  },
  {
    id: newsIds.recentFeature,
    channel: "feature",
    title: "Recent Feature",
    text: "Recent feature details.",
    date: new Date(now.getTime() - 2 * dayMs),
    tags: ["recent"],
  },
  {
    id: newsIds.futureFeature,
    channel: "feature",
    title: "Future Feature",
    text: "Future feature details.",
    date: new Date(now.getTime() + 2 * dayMs),
    tags: ["future"],
  },
  {
    id: newsIds.upcomingEvent,
    channel: EVENT_CHANNEL,
    title: "Upcoming Event",
    text: "Upcoming event details.",
    date: new Date(now.getTime() + 4 * dayMs),
    tags: ["event"],
    url: "https://example.com/upcoming-event",
  },
  {
    id: newsIds.latestAnnouncement,
    channel: "announcement",
    title: "Latest Announcement",
    text: "Latest announcement details.",
    date: new Date(now.getTime() - 1 * dayMs),
    tags: ["announcement"],
    history: {
      [historyTimestamp]: {
        channel: "announcement",
        date: new Date(now.getTime() - 12 * dayMs),
        title: "Previous Announcement Title",
        text: "Previous announcement text.",
        tags: ["announcement"],
        url: "https://example.com/previous",
        until: null,
      },
    },
  },
];

describe("news queries", () => {
  async function insertNewsItem(item: SeedNewsItem): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO news
        (id, channel, title, text, url, tags, hide, date, until, history)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        item.id,
        item.channel,
        item.title,
        item.text,
        item.url ?? null,
        item.tags ?? null,
        item.hide ?? false,
        item.date,
        item.until ?? null,
        item.history ?? null,
      ],
    );
  }

  beforeAll(async () => {
    await initEphemeralDatabase({});
    await getPool().query("DELETE FROM news");
    for (const item of seedNewsItems) {
      await insertNewsItem(item);
    }
    clearCache();
  }, 15000);

  beforeEach(() => {
    clearCache();
  });

  afterAll(async () => {
    await getPool().query("DELETE FROM news");
    await testCleanup();
  });

  it("getFeedData returns visible non-event items in descending order", async () => {
    const results = await getFeedData();
    const ids = results.map((item) => Number(item.id));

    expect(ids).toEqual([
      newsIds.latestAnnouncement,
      newsIds.recentFeature,
      newsIds.platformUpdate,
      newsIds.announcement,
      newsIds.oldFeature,
    ]);
  });

  it("getNewsItem returns hidden items for editing", async () => {
    const item = await getNewsItem(newsIds.hiddenAbout);
    expect(item).not.toBeNull();
    expect(item?.hide).toBe(true);
    expect(item?.title).toBe("Hidden About");
  });

  it("getNewsItemUser reports future and expired status", async () => {
    const futureItem = (await getNewsItemUser(
      newsIds.futureFeature,
    )) as NewsItemWithStatus;
    const expiredItem = (await getNewsItemUser(
      newsIds.expiredFeature,
    )) as NewsItemWithStatus;

    expect(futureItem).not.toBeNull();
    expect(expiredItem).not.toBeNull();
    expect(futureItem.future).toBe(true);
    expect(futureItem.expired).toBe(false);
    expect(expiredItem.future).toBe(false);
    expect(expiredItem.expired).toBe(true);
  });

  it("getNewsItemUser includes history entries", async () => {
    const item = await getNewsItemUser(newsIds.latestAnnouncement);
    expect(item).not.toBeNull();
    expect(item?.history).toBeDefined();
    expect(Object.keys(item?.history ?? {})).toContain(
      String(historyTimestamp),
    );
  });

  it("getNewsItemUserPrevNext returns neighbors for a mid-range item", async () => {
    const { news, prev, next } = await getNewsItemUserPrevNext(
      newsIds.recentFeature,
    );

    expect(news).not.toBeNull();
    expect(prev).not.toBeNull();
    expect(next).not.toBeNull();
    expect(Number(prev?.id)).toBe(newsIds.platformUpdate);
    expect(Number(next?.id)).toBe(newsIds.latestAnnouncement);
  });

  it("getIndex includes hidden/future items but excludes events", async () => {
    const results = (await getIndex(8, 0)) as NewsItemWithStatus[];
    const ids = results.map((item) => Number(item.id));

    expect(ids).toContain(newsIds.futureFeature);
    expect(ids).toContain(newsIds.hiddenAbout);
    expect(ids).not.toContain(newsIds.pastEvent);
    expect(ids).not.toContain(newsIds.upcomingEvent);

    const futureItem = results.find(
      (item) => Number(item.id) === newsIds.futureFeature,
    );
    const expiredItem = results.find(
      (item) => Number(item.id) === newsIds.expiredFeature,
    );

    expect(futureItem?.future).toBe(true);
    expect(expiredItem?.expired).toBe(true);
  });

  it("getMostRecentNews returns the latest visible news item", async () => {
    const mostRecent = await getMostRecentNews();
    expect(mostRecent).not.toBeNull();
    expect(Number(mostRecent?.id)).toBe(newsIds.latestAnnouncement);
  });

  it("getRecentHeadlines returns the most recent headlines", async () => {
    const headlines = await getRecentHeadlines(3);
    expect(headlines).not.toBeNull();

    const ids = (headlines ?? []).map((item) => Number(item.id));
    expect(ids).toEqual([
      newsIds.latestAnnouncement,
      newsIds.recentFeature,
      newsIds.platformUpdate,
    ]);
  });

  it("getUpcomingNewsChannelItems returns future items for a channel", async () => {
    const upcomingEvents = await getUpcomingNewsChannelItems(EVENT_CHANNEL);
    const ids = upcomingEvents.map((item) => Number(item.id));

    expect(ids).toEqual([newsIds.upcomingEvent]);
  });

  it("getPastNewsChannelItems returns past items for a channel", async () => {
    const pastEvents = await getPastNewsChannelItems(EVENT_CHANNEL);
    const ids = pastEvents.map((item) => Number(item.id));

    expect(ids).toEqual([newsIds.pastEvent]);
  });
});
