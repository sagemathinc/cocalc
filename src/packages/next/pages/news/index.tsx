/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  Alert,
  Col,
  Divider,
  Input,
  Layout,
  Radio,
  Row,
  Space,
  Tooltip,
} from "antd";
import { useState } from "react";

import getPool from "@cocalc/database/pool";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
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
import { useRouter } from "next/router";
import rssIcon from "public/rss.svg";
import jsonfeedIcon from "public/jsonfeed.png";

// news shown per page
const SLICE_SIZE = 10;

type Filter = Channel | "all";
interface Props {
  customize: CustomizeType;
  news: NewsWithFuture[];
  offset: number;
}

export default function AllNews(props: Props) {
  const { customize, news, offset } = props;
  const { siteName, dns } = customize;
  const router = useRouter();
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;

  const [filter, setFilter] = useState<Filter>("all");
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
                  <Icon name={CHANNELS_ICONS[c] as IconName} /> {capitalize(c)}
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
      // only admins see future and hidden news
      .filter((n) => isAdmin || (!n.future && !n.hide))
      .filter((n) => filter === "all" || n.channel == filter)
      .filter((n) => {
        if (search === "") return true;
        const txt = search.toLowerCase();
        return (
          // substring match for title and text
          n.title.toLowerCase().includes(txt) ||
          n.text.toLowerCase().includes(txt) ||
          // exact match for tags
          n.tags?.map((t) => `#${t.toLowerCase()}`).some((t) => t == txt)
        );
      })
      .map((n) => (
        <Col key={n.id} xs={24} sm={24} md={12}>
          <News
            news={n}
            dns={dns}
            showEdit={isAdmin}
            small
            onTagClick={(tag) => {
              const ht = `#${tag}`;
              // that's a toggle: if user clicks again on the same tag, remove the search filter
              search === ht ? setSearch("") : setSearch(ht);
            }}
          />
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
        type="error"
        message={
          <>
            Admin only: <A href="/news/edit/new">Create News Item</A>
          </>
        }
      />
    );
  }

  function titleFeedIcons() {
    return (
      <Space direction="horizontal" size="middle" style={{ float: "right" }}>
        <A href="/news/rss.xml" external>
          <Image src={rssIcon} width={32} height={32} alt="RSS Feed" />
        </A>
        <A href="/news/feed.json" external>
          <Image
            src={jsonfeedIcon}
            width={32}
            height={32}
            alt="JSON Feed"
            style={{ borderRadius: "5px" }}
          />
        </A>
      </Space>
    );
  }

  function content() {
    return (
      <>
        <Title level={1}>
          {siteName} News
          {titleFeedIcons()}
        </Title>
        <Paragraph>
          Recent news about {siteName}. You can also subscribe via{" "}
          {/* This is intentonally a regular link, to "break out" of next.js */}
          <A href="/news/rss.xml" external>
            <Image src={rssIcon} width={16} height={16} alt="RSS Feed" /> RSS
            Feed
          </A>{" "}
          or{" "}
          <A href="/news/feed.json" external>
            <Image src={jsonfeedIcon} width={16} height={16} alt="JSON Feed" />{" "}
            JSON Feed
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

  function slice(dir: "future" | "past") {
    const next = offset + (dir === "future" ? -1 : 1) * SLICE_SIZE;
    const newOffset = Math.max(0, next);
    router.push(`?offset=${newOffset}`);
  }

  function renderSlicer() {
    //if (news.length < SLICE_SIZE && offset === 0) return;
    return (
      <div style={{ marginTop: "60px", textAlign: "center" }}>
        <Radio.Group optionType="button">
          <Radio.Button
            disabled={news.length < SLICE_SIZE}
            onClick={() => slice("past")}
          >
            ← Older
          </Radio.Button>
          <Radio.Button disabled={offset === 0} onClick={() => slice("future")}>
            Newer →
          </Radio.Button>
        </Radio.Group>
      </div>
    );
  }

  function renderFeeds() {
    const iconSize = 20;
    return (
      <>
        <Divider
          orientation="center"
          style={{
            marginTop: "60px",
            textAlign: "center",
          }}
        />
        <div
          style={{
            marginTop: "60px",
            marginBottom: "60px",
            textAlign: "center",
          }}
        >
          <Space direction="horizontal" size="large">
            <A href="/news/rss.xml" external>
              <Image
                src={rssIcon}
                width={iconSize}
                height={iconSize}
                alt="RSS Feed"
              />{" "}
              RSS
            </A>
            <A href="/news/feed.json" external>
              <Image
                src={jsonfeedIcon}
                width={iconSize}
                height={iconSize}
                alt="Json Feed"
              />{" "}
              JSON
            </A>
          </Space>
        </div>
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
            {renderSlicer()}
            {renderFeeds()}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

const Q = `
SELECT
  id, channel, title, text, url, hide, tags,
  date >= NOW() as future,
  extract(epoch from date::timestamptz)::INTEGER as date
FROM news
WHERE date >= NOW() - '6 months'::interval
ORDER BY date DESC
LIMIT ${SLICE_SIZE}
OFFSET $1`;

export async function getServerSideProps(context) {
  const pool = getPool("long");
  const offsetVal = Number(context.query.offset ?? 0);
  const offset = Math.max(0, Number.isNaN(offsetVal) ? 0 : offsetVal);
  const { rows: news } = await pool.query(Q, [offset]);
  return await withCustomize({ context, props: { news, offset } });
}
