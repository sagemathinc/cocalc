import getPool from "@cocalc/database/pool";
import getCustomize from "@cocalc/server/settings/customize";
import { GetServerSideProps } from "next";

export default function RSS() {
  return null;
}

// render RSS news feed
// Ref: https://www.w3.org/Protocols/rfc822/

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  if (!res) return { props: {} };

  const pool = getPool("long");

  // we exclude future news items
  const { rows } = await pool.query(
    `SELECT id, extract(epoch from date) as date, channel, title, text, url
    FROM news
    WHERE date BETWEEN NOW() - '6 months'::interval AND NOW()
    ORDER BY date DESC
    LIMIT 100`
  );

  const { siteName } = await getCustomize();

  const rss = rows
    .map((n) => {
      const date = new Date(n.date * 1000);
      const url = `https://cocalc.com/news/${n.id}`;
      const title = n.title;
      const text = n.text;
      const prio = n.channel == "announcement" ? "1.0" : "0.5";
      // RSS XML format entry
      return `<item>
<title>${title}</title>
<link>${url}</link>
<description>${text}</description>
<pubDate>${date.toUTCString()}</pubDate>
<guid>${n.id}</guid>
<priority>${prio}</priority>
</item>`;
    })
    .join("\n");

  res.setHeader("Content-Type", "text/xml");
  res.write(`<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
<title>${siteName} News</title>
<pubDate>${new Date().toUTCString()}</pubDate>
${rss}
</channel>
</rss>`);
  res.end();

  return {
    props: {},
  };
};
