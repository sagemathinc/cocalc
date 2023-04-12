/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Breadcrumb, Col, Layout, Radio, Row } from "antd";
import { useRouter } from "next/router";

import getPool from "@cocalc/database/pool";
import { Icon } from "@cocalc/frontend/components/icon";
import { slugURL } from "@cocalc/util/news";
import { NewsItem } from "@cocalc/util/types/news";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import A from "components/misc/A";
import { News } from "components/news/news";
import { NewsWithFuture } from "components/news/types";
import { useDateStr } from "components/news/useDateStr";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
  news: NewsWithFuture;
  prev?: Pick<NewsItem, "id" | "title">;
  next?: Pick<NewsItem, "id" | "title">;
}

export default function NewsPage(props: Props) {
  const { customize, news, prev, next } = props;
  const { siteName, dns } = customize;
  const profile = useProfile({ noCache: true });
  const router = useRouter();
  const isAdmin = profile?.is_admin;
  const dateStr = useDateStr(news);
  const permalink = slugURL(news);

  const title = `${news.title} – News – ${siteName}`;

  function future() {
    if (news.future && !isAdmin) {
      return (
        <Alert type="info" banner={true} message="News not yet published" />
      );
    }
  }

  function content() {
    if (isAdmin || !news.future) {
      return <News dns={dns} news={news} showEdit={isAdmin} standalone />;
    }
  }

  function breadcrumb() {
    return (
      <Breadcrumb>
        <Breadcrumb.Item>
          <A href="/">{siteName}</A>
        </Breadcrumb.Item>
        <Breadcrumb.Item>
          <A href="/news">News</A>
        </Breadcrumb.Item>
        <Breadcrumb.Item>
          <A href={permalink}>
            {dateStr}: {news.title}
          </A>
        </Breadcrumb.Item>
      </Breadcrumb>
    );
  }

  function prevNext() {
    return (
      <Radio.Group buttonStyle="outline">
        <Radio.Button
          disabled={!prev}
          style={{ userSelect: "none" }}
          onClick={() => {
            prev && router.push(slugURL(prev));
          }}
        >
          <Icon name="arrow-left" /> Prev
        </Radio.Button>
        <Radio.Button
          disabled={!next}
          style={{ userSelect: "none" }}
          onClick={() => {
            next && router.push(slugURL(next));
          }}
        >
          <Icon name="arrow-right" /> Next
        </Radio.Button>
      </Radio.Group>
    );
  }

  function renderTop() {
    return (
      <Row justify="space-between" gutter={15} style={{ margin: "30px 0" }}>
        <Col>{breadcrumb()}</Col>
        <Col>{prevNext()}</Col>
      </Row>
    );
  }

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
            {renderTop()}
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

const NEXT = `
SELECT id, title
FROM news
WHERE date >= (SELECT date FROM news WHERE id = $1)
  AND id != $1
  AND hide IS NOT TRUE
  AND date < NOW()
ORDER BY date ASC, id ASC
LIMIT 1`;

const PREV = `
SELECT id, title
FROM news
WHERE date <= (SELECT date FROM news WHERE id = $1)
  AND id != $1
  AND hide IS NOT TRUE
  AND date < NOW()
ORDER BY date DESC, id DESC
LIMIT 1`;

export async function getServerSideProps(context) {
  const pool = getPool("long");
  const { id: idOrig } = context.query;

  // if id is null or does not start with an integer, return { notFound: true }
  if (idOrig == null) return { notFound: true };

  // we support URLs with a slug and id at the end, e.g., "my-title-1234"
  // e.g. https://www.semrush.com/blog/what-is-a-url-slug/
  const id = idOrig.split("-").pop();
  if (!Number.isInteger(Number(id))) return { notFound: true };

  try {
    const [newsDB, prevDB, nextDB] = await Promise.all([
      pool.query(Q, [id]),
      pool.query(PREV, [id]),
      pool.query(NEXT, [id]),
    ]);
    const [news, prev, next] = [
      newsDB.rows[0],
      prevDB.rows[0] ?? null,
      nextDB.rows[0] ?? null,
    ];
    if (news == null) {
      throw new Error(`not found`);
    }
    return await withCustomize({
      context,
      props: { news, prev, next },
    });
  } catch (err) {
    console.warn(`Error getting news with id=${id}`, err);
  }

  return {
    notFound: true,
  };
}
