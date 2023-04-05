/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { create as createXML } from "xmlbuilder2";

import LRU from "lru-cache";
const cache = new LRU<"rss", NewsType[]>({ max: 1, ttl: 60 * 1000 });

import getPool from "@cocalc/database/pool";
import getCustomize from "@cocalc/server/settings/customize";
import { GetServerSideProps } from "next";
import { NewsType } from "@cocalc/util/types/news";
import { XMLBuilder } from "xmlbuilder2/lib/interfaces";

export default function RSS() {
  return null;
}

// we exclude hidden and future news items
const Q = `
SELECT
  id, channel, title, text, url,
  extract(epoch from date::timestamp)::integer as date
FROM news
WHERE date BETWEEN NOW() - '6 months'::interval AND NOW()
  AND hide IS NOT TRUE
ORDER BY date DESC
LIMIT 100`;

async function getRSS(): Promise<NewsType[]> {
  const rssCached = cache.get("rss");
  if (rssCached) return rssCached;
  const pool = getPool("long");
  const { rows } = await pool.query(Q);
  cache.set("rss", rows as NewsType[]);
  return rows;
}

async function getItemsXML(
  channel: XMLBuilder,
  dns: string
): Promise<XMLBuilder> {
  for (const n of await getRSS()) {
    const { date } = n;
    const pubDate: Date =
      typeof date === "number" ? new Date(date * 1000) : date;
    const url = `https://${dns}/news/${n.id}`;
    const title = n.title;
    const text = n.text;

    channel
      .ele("item")
      .ele("title")
      .txt(title)
      .up()
      .ele("link")
      .txt(url)
      .up()
      .ele("description")
      .dat(text)
      .up()
      .ele("pubDate")
      .txt(pubDate.toUTCString())
      .up()
      .ele("guid")
      .txt(`https://${dns}/news/${n.id}`)
      .up();
  }

  return channel;
}

async function getXML(): Promise<string> {
  const { siteName, dns } = await getCustomize();
  if (!dns) throw Error("no dns");

  const selfLink = `https://${dns}/news/rss.xml`;
  const atom = "http://www.w3.org/2005/Atom";

  const root = createXML({ version: "1.0", encoding: "UTF-8" });
  const channel: XMLBuilder = root
    .ele("rss", {
      version: "2.0",
    })
    .att(atom, "xmlns:atom", atom)
    .ele("channel")
    .ele("atom:link", {
      href: selfLink,
      rel: "self",
      type: "application/rss+xml",
    })
    .up()
    .ele("title")
    .txt(`${siteName} News`)
    .up()
    .ele("description")
    .txt(`News from ${siteName} available also at https://${dns}/news`)
    .up()
    .ele("language")
    .txt("en-us")
    .up()
    .ele("link")
    .txt(selfLink)
    .up()
    .ele("pubDate")
    .txt(new Date().toUTCString())
    .up();

  return (await getItemsXML(channel, dns)).end({ prettyPrint: true });
}

// render RSS news feed
// check: https://validator.w3.org/feed/check.cgi
// Ref: https://www.w3.org/Protocols/rfc822/ (e.g. that's why it's date.toUTCString())
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  if (!res) return { props: {} };
  res.setHeader("Content-Type", "text/xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.write(await getXML());
  res.end();

  return {
    props: {},
  };
};
