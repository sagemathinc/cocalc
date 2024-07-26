/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import LRU from "lru-cache";

import { get } from "@cocalc/server/news/get";
import getCustomize from "@cocalc/database/settings/customize";
import { slugURL } from "@cocalc/util/news";
import { NewsItem } from "@cocalc/util/types/news";
import { renderMarkdown } from "lib/news";
import { GetServerSideProps } from "next";
import IconLogo from "public/logo/icon.svg";

const cache = new LRU<"feed", any>({ max: 10, ttl: 60 * 1000 });

export default function RSS() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  if (!res) return { props: {} };

  try {
    res.setHeader("Content-Type", "application/feed+json");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.write(JSON.stringify(await feed()));
    res.end();
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.write(JSON.stringify({ error: `${err.message}` }));
    res.end();
  }

  return {
    props: {},
  };
};

async function feed() {
  const cached = cache.get("feed");
  if (cached) return cached;
  const data = await get();
  const feed = await getFeed(data);

  cache.set("feed", feed);
  return feed;
}

function getItems(data: NewsItem[], dns): object[] {
  return data.map((n) => {
    const { id, text, title, date, url } = n;
    const date_published = (
      typeof date === "number" ? new Date(date * 1000) : date
    ).toISOString();
    const selfURL = `https://${dns}/${slugURL(n)}`;

    return {
      id,
      url: selfURL,
      external_url: url,
      title,
      content_html: renderMarkdown(text),
      date_published,
    };
  });
}

// This follows https://www.jsonfeed.org/version/1.1/
async function getFeed(data: NewsItem[]): Promise<object> {
  const { siteName, dns } = await getCustomize();
  const icon_url = IconLogo.src;
  const home_page_url = `https://${dns}/news`;
  const feed_url = `https://${dns}/feed.json`;

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `${siteName} News`,
    home_page_url,
    description: `News about ${siteName} – also available at https://${dns}/news`,
    icon: icon_url,
    favicon: icon_url,
    feed_url,
    items: getItems(data, dns),
  };

  return feed;
}
