/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Breadcrumb, Layout } from "antd";

import getPool from "@cocalc/database/pool";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import A from "components/misc/A";
import { News } from "components/news/news";
import { NewsWithFuture } from "components/news/types";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import withCustomize from "lib/with-customize";
import { slugURL } from "@cocalc/util/news";
import TimeAgo from "timeago-react";

interface Props {
  customize: CustomizeType;
  news: NewsWithFuture;
  timestamp: number; // unix epoch in seconds
}

export default function NewsPage(props: Props) {
  const { customize, news, timestamp } = props;
  const { siteName, dns } = customize;
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;
  const permalink = slugURL(news);

  function future() {
    if (news.future && !isAdmin) {
      return (
        <Alert type="info" banner={true} message="News not yet published" />
      );
    }
  }

  function content() {
    if (isAdmin || !news.future) {
      return <News dns={dns} news={news} showEdit={isAdmin} historyMode standalone />;
    }
  }

  function breadcrumb() {
    return (
      <Breadcrumb style={{ margin: "30px 0" }}>
        <Breadcrumb.Item>
          <A href="/">{siteName}</A>
        </Breadcrumb.Item>
        <Breadcrumb.Item>
          <A href="/news">News</A>
        </Breadcrumb.Item>
        <Breadcrumb.Item>
          <A href={permalink}>#{news.id}</A>
        </Breadcrumb.Item>
        <Breadcrumb.Item>
          <A href={`/news/${news.id}/${timestamp}`}>
            <TimeAgo datetime={1000 * timestamp} />
          </A>
        </Breadcrumb.Item>
      </Breadcrumb>
    );
  }

  const title = `${news.title} – News – ${siteName}`;

  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              minHeight: "75vh",
              maxWidth: MAX_WIDTH,
              padding: "30px 15px",
              margin: "0 auto",
            }}
          >
            {breadcrumb()}
            {future()}
            {content()}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

const Q = `
SELECT
  id, title, channel, text, url, hide, history, tags,
  date >= NOW() as future,
  extract(epoch from date::timestamptz)::INTEGER as date
FROM news
WHERE id = $1`;

export async function getServerSideProps(context) {
  const pool = getPool("long");
  const { id: idOrig, timestamp } = context.query;

  // if id is null or does not start with an integer, return { notFound: true }
  if (idOrig == null) return { notFound: true };

  // we support URLs with a slug and id at the end, e.g., "my-title-1234"
  // e.g. https://www.semrush.com/blog/what-is-a-url-slug/
  const id = idOrig.split("-").pop();
  if (!Number.isInteger(Number(id))) return { notFound: true };

  if (timestamp == null) return { notFound: true };
  if (!Number.isInteger(Number(timestamp))) return { notFound: true };

  try {
    const news = (await pool.query(Q, [id])).rows[0];
    if (news == null) {
      throw new Error(`not found`);
    }
    const historic = news.history[Number(timestamp)];
    if (historic == null) {
      throw new Error(`history ${timestamp} not found`);
    }

    return await withCustomize({
      context,
      props: {
        timestamp: Number(timestamp),
        news: { ...news, ...historic, date: Number(timestamp) },
      },
    });
  } catch (err) {
    console.warn(`Error getting news with id=${id}`, err);
  }

  return {
    notFound: true,
  };
}
