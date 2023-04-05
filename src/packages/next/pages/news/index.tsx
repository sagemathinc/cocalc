/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Col, Layout, Radio, Row, Space, Input, Tooltip } from "antd";
import { useState } from "react";

import getPool from "@cocalc/database/pool";
import {
  CHANNELS,
  CHANNELS_DESCRIPTIONS,
  CHANNELS_ICONS,
  Channel,
} from "@cocalc/util/types/news";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { News } from "components/news/news";
import type { NewsWithFuture } from "components/news/types";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import withCustomize from "lib/with-customize";
import Image from "next/image";
import rssIcon from "public/rss.svg";
import { capitalize } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  customize: CustomizeType;
  news: NewsWithFuture[];
}

export default function AllNews(props: Props) {
  const { customize, news } = props;
  const { siteName, dns } = customize;
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;

  const [filter, setFilter] = useState<Channel | "all">("all");
  const [search, setSearch] = useState<string>("");

  function renderFilter() {
    return (
      <Row justify="space-between" gutter={15}>
        <Col>
          <Radio.Group
            defaultValue={"all"}
            buttonStyle="solid"
            onChange={(e) => setFilter(e.target.value)}
          >
            <Radio.Button value="all">Show All</Radio.Button>
            {CHANNELS.map((c) => (
              <Tooltip key={c} title={CHANNELS_DESCRIPTIONS[c]}>
                <Radio.Button key={c} value={c}>
                  <Icon name={CHANNELS_ICONS[c]} /> {capitalize(c)}
                </Radio.Button>
              </Tooltip>
            ))}
          </Radio.Group>
        </Col>
        <Col>
          <Input.Search
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            addonBefore="Filter"
            placeholder="Search text…"
            allowClear
          />
        </Col>
      </Row>
    );
  }

  function renderNews() {
    const rendered = news
      .filter((n) => isAdmin || (!n.future && !n.hide))
      .filter((n) => filter === "all" || n.channel == filter)
      .filter((n) => {
        if (search === "") return true;
        const txt = search.toLowerCase();
        return (
          n.title.toLowerCase().includes(txt) ||
          n.text.toLowerCase().includes(txt)
        );
      })
      .map((n) => (
        <Col key={n.id} xs={24} sm={24} md={12}>
          <News news={n} dns={dns} showEdit={isAdmin} small />
        </Col>
      ));
    if (rendered.length === 0) {
      return <Alert banner type="info" message="No news found" />;
    } else {
      return <Row gutter={[30, 30]}>{rendered}</Row>;
    }
  }

  function adminInfo() {
    if (!isAdmin) return;
    return (
      <Alert
        banner={true}
        type="info"
        message={
          <>
            Admin only: <A href="/news/edit/new">Create News Item</A>
          </>
        }
      />
    );
  }

  function content() {
    return (
      <>
        <Title level={1}>
          {siteName} News
          <A href="/news/rss.xml" external style={{ float: "right" }}>
            <Image src={rssIcon} width={32} height={32} alt="RSS Feed" />
          </A>
        </Title>
        <Paragraph>
          Recent news about {siteName}. You can also subscribe via{" "}
          {/* This is intentonally a regular link, to "break out" of next.js */}
          <A href="/news/rss.xml" external>
            <Image src={rssIcon} width={16} height={16} alt="RSS Feed" /> RSS
            Feed
          </A>
          .
        </Paragraph>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {renderFilter()}
          {adminInfo()}
          {renderNews()}
        </Space>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title={`${siteName} News`} />
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
  id, channel, title, text, url, hide,
  date >= NOW() as future,
  extract(epoch from date::timestamptz)::INTEGER as date
FROM news
WHERE date >= NOW() - '6 months'::interval
ORDER BY date DESC
LIMIT 100`;

export async function getServerSideProps(context) {
  const pool = getPool("long");
  const { rows: news } = await pool.query(Q);
  return await withCustomize({ context, props: { news } });
}
