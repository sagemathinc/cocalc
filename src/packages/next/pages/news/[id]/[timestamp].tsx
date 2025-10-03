/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Breadcrumb, Col, Layout, Radio, Row } from "antd";

import { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import TimeAgo from "timeago-react";

import { getNewsItemUser } from "@cocalc/database/postgres/news";
import { Icon } from "@cocalc/frontend/components/icon";
import { slugURL } from "@cocalc/util/news";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import A from "components/misc/A";
import { News } from "components/news/news";
import { NewsWithStatus } from "components/news/types";
import { useDateStr } from "components/news/useDateStr";
import { MAX_WIDTH, NOT_FOUND } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import { extractID } from "lib/news";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
  news: NewsWithStatus;
  timestamp: number; // unix epoch in seconds
  prev?: number;
  next?: number;
}

export default function NewsPage(props: Props) {
  const { customize, news, timestamp, prev, next } = props;
  const { siteName } = customize;
  const router = useRouter();
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;
  const permalink = slugURL(news);
  const dateStr = useDateStr(news, true);

  const { id } = news;
  const title = `${news.title}@${dateStr} – News – ${siteName}`;

  function future() {
    if (news.future && !isAdmin) {
      return (
        <Alert type="info" banner={true} message="News not yet published" />
      );
    }
  }

  function content() {
    if (isAdmin || !news.future) {
      return <News news={news} showEdit={isAdmin} historyMode standalone />;
    }
  }

  function breadcrumb() {
    const items = [
      { key: "/", title: <A href="/">{siteName}</A> },
      { key: "/news", title: <A href="/news">News</A> },
      { key: "permalink", title: <A href={permalink}>#{news.id}</A> },
      {
        key: "timestamp",
        title: (
          <A href={`/news/${news.id}/${timestamp}`}>
            <TimeAgo datetime={1000 * timestamp} />
          </A>
        ),
      },
    ];
    return <Breadcrumb items={items} />;
  }

  function up() {
    return (
      <Radio.Group buttonStyle="outline" size="small">
        <Radio.Button
          disabled={!prev}
          style={{ userSelect: "none" }}
          onClick={() => {
            prev && router.push(`/news/${id}/${prev}`);
          }}
        >
          <Icon name="arrow-left" /> Older
        </Radio.Button>
        <Radio.Button
          style={{ userSelect: "none" }}
          onClick={() => {
            router.push(slugURL(news));
          }}
        >
          <Icon name="arrow-up" /> Current
        </Radio.Button>
        <Radio.Button
          disabled={!next}
          style={{ userSelect: "none" }}
          onClick={() => {
            next && router.push(`/news/${id}/${next}`);
          }}
        >
          <Icon name="arrow-right" /> Newer
        </Radio.Button>
      </Radio.Group>
    );
  }

  function renderTop() {
    return (
      <Row justify="space-between" gutter={15} style={{ margin: "30px 0" }}>
        <Col>{breadcrumb()}</Col>
        <Col>{up()}</Col>
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

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { query } = context;

  const id = extractID(query.id);
  if (id == null) return NOT_FOUND;

  // we just re-use the logic for the id
  const timestamp = extractID(query.timestamp);
  if (timestamp == null) return NOT_FOUND;

  try {
    const news = await getNewsItemUser(id);
    if (news == null) {
      throw new Error(`not found`);
    }

    const { history } = news;

    if (history == null) return NOT_FOUND;

    const historic = history[timestamp];
    if (historic == null) {
      throw new Error(`history ${timestamp} not found`);
    }

    // sort keys in news.history by their timestamp value
    const timestamps = Object.keys(history)
      .map((ts) => Number(ts))
      .filter((ts) => !Number.isNaN(ts))
      .sort((a, b) => a - b);
    // prev and next are the timestamps of the previous and next news item
    const prev = timestamps[timestamps.indexOf(timestamp) - 1] ?? null;
    const next = timestamps[timestamps.indexOf(timestamp) + 1] ?? null;

    return await withCustomize({
      context,
      props: {
        timestamp,
        prev,
        next,
        news: { ...news, ...historic, date: timestamp },
      },
    });
  } catch (err) {
    console.warn(`Error getting news with id=${id}`, err);
  }

  return NOT_FOUND;
}
